// POST /api/sync/parsa/mirror — ParsaStore → 일반 Store 미러링
//
// 한국소비자원 등록 매장(615개)을 우리 일반 Store 테이블에 미러링해서
// 메인 검색/주변매장/지도에 자연스럽게 노출.
// 좌표(xMapCoord/yMapCoord)가 있는 매장은 지도 표시 가능.
//
// 인증: checkSyncAuth (X-Sync-Token 또는 사이트 내부 호출)
// 멱등성: Store.externalId = "parsa:{entpId}" 기준 upsert.
//
// 응답: { ok, totalParsaStores, mirrored, inserted, updated, withCoords, elapsedMs }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";

export const maxDuration = 60;

// entpName에서 진짜 chain 추출 — "롯데슈퍼잠원점" → chain="롯데슈퍼"
// 매칭 안 되는 매장은 "기타 매장" chain으로 fallback (출처는 source="parsa"로만 표시).
// 우선순위: 더 구체적인 prefix를 먼저 (이마트트레이더스 > 이마트, 홈플러스익스프레스 > 홈플러스)
const CHAIN_PATTERNS: Array<{ test: (n: string) => boolean; chain: string; category: string }> = [
  // 대형마트
  { test: (n) => n.includes("이마트트레이더스") || n.includes("트레이더스"), chain: "트레이더스", category: "mart" },
  { test: (n) => n.includes("이마트에브리데이"), chain: "이마트에브리데이", category: "mart" },
  { test: (n) => n.includes("이마트24"), chain: "이마트24", category: "convenience" },
  { test: (n) => n.includes("이마트"), chain: "이마트", category: "mart" },
  { test: (n) => n.includes("롯데마트"), chain: "롯데마트", category: "mart" },
  { test: (n) => n.includes("롯데슈퍼"), chain: "롯데슈퍼", category: "mart" },
  { test: (n) => n.includes("롯데백화점"), chain: "롯데백화점", category: "mart" },
  { test: (n) => n.includes("홈플러스익스프레스") || n.includes("홈플러스 익스프레스") || n.includes("홈플익스"), chain: "홈플러스 익스프레스", category: "mart" },
  { test: (n) => n.includes("홈플러스"), chain: "홈플러스", category: "mart" },
  { test: (n) => n.includes("킴스클럽"), chain: "킴스클럽", category: "mart" },
  { test: (n) => n.includes("코스트코") || n.toLowerCase().includes("costco"), chain: "코스트코", category: "mart" },
  { test: (n) => n.includes("하나로마트") || n.includes("농협하나로") || n.includes("NH농협"), chain: "농협하나로마트", category: "mart" },
  { test: (n) => n.includes("GS더프레시") || n.includes("GS프레시") || n.includes("GS THE FRESH"), chain: "GS더프레시", category: "mart" },
  { test: (n) => n.includes("메가마트"), chain: "메가마트", category: "mart" },
  { test: (n) => n.includes("탑마트"), chain: "탑마트", category: "mart" },
  // 편의점
  { test: (n) => n.includes("GS25"), chain: "GS25", category: "convenience" },
  { test: (n) => n.toUpperCase().includes("CU") && !n.includes("PCU"), chain: "CU", category: "convenience" },
  { test: (n) => n.includes("세븐일레븐") || n.includes("7-ELEVEN") || n.includes("7일레븐"), chain: "세븐일레븐", category: "convenience" },
  { test: (n) => n.includes("미니스톱"), chain: "미니스톱", category: "convenience" },
  // 백화점
  { test: (n) => n.includes("현대백화점"), chain: "현대백화점", category: "mart" },
  { test: (n) => n.includes("신세계백화점") || (n.includes("신세계") && !n.includes("이마트")), chain: "신세계백화점", category: "mart" },
  { test: (n) => n.includes("AK플라자"), chain: "AK플라자", category: "mart" },
  { test: (n) => n.includes("갤러리아"), chain: "갤러리아백화점", category: "mart" },
];

const FALLBACK_CHAIN_NAME = "기타 매장";
const FALLBACK_CHAIN_CATEGORY = "mart";

function extractChain(entpName: string): { chain: string; category: string } {
  for (const p of CHAIN_PATTERNS) {
    if (p.test(entpName)) return { chain: p.chain, category: p.category };
  }
  return { chain: FALLBACK_CHAIN_NAME, category: FALLBACK_CHAIN_CATEGORY };
}

// 매장명 정규화 — 시드/사용자 기여로 미리 들어온 row를 참가격 미러와
// 같은 매장으로 인식하기 위한 키. 예: "이마트 천호점" ≡ "이마트천호점".
function normName(s: string): string {
  return s.toLowerCase().replace(/[\s\-_·.()]+/g, "");
}

export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 50_000;
  const url = new URL(req.url);
  const fromParam = parseInt(url.searchParams.get("from") ?? "0", 10);
  const startFrom = Number.isFinite(fromParam) && fromParam >= 0 ? fromParam : 0;
  const sliceLimit = Math.min(
    1000,
    Math.max(50, parseInt(url.searchParams.get("limit") ?? "300", 10) || 300)
  );

  // 1) ParsaStore — partial-resume용 slice
  const parsaStoresAll = await prisma.parsaStore.findMany({
    select: {
      entpId: true,
      entpName: true,
      entpTypeCode: true,
      entpTelno: true,
      addrBasic: true,
      roadAddrBasic: true,
      lat: true,
      lng: true,
    },
    orderBy: { entpId: "asc" },
  });
  const totalParsaStores = parsaStoresAll.length;
  const parsaStores = parsaStoresAll.slice(startFrom, startFrom + sliceLimit);

  if (totalParsaStores === 0) {
    return NextResponse.json({
      ok: false,
      totalParsaStores: 0,
      mirrored: 0,
      inserted: 0,
      updated: 0,
      withCoords: 0,
      elapsedMs: Date.now() - startedAt,
      error: "ParsaStore 비어있음 — /api/sync/parsa?type=stores 먼저 실행 필요",
    });
  }

  // 4) 미러 데이터 생성
  type MirrorRow = {
    externalId: string;
    chainId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    phone: string | null;
    hours: string | null;
  };

  // 2) 매장별로 chain 추출 → 필요한 chain 미리 upsert
  const chainCache = new Map<string, string>(); // chain name → chain.id
  for (const p of parsaStores) {
    const { chain: chainName, category } = extractChain(p.entpName);
    if (chainCache.has(chainName)) continue;
    const c = await prisma.chain.upsert({
      where: { name: chainName },
      update: {}, // 기존 chain category는 그대로 유지 (시드값 보존)
      create: { name: chainName, category },
    });
    chainCache.set(chainName, c.id);
  }

  const mirrorRows: MirrorRow[] = parsaStores.map((p) => {
    const { chain: chainName } = extractChain(p.entpName);
    const chainId = chainCache.get(chainName)!;
    // store name은 entpName 그대로 — [업태] 접두사 제거
    const name = p.entpName;
    const address = p.roadAddrBasic ?? p.addrBasic ?? "주소 미상";
    return {
      externalId: `parsa:${p.entpId}`,
      chainId,
      name,
      address,
      lat: p.lat ?? 0,
      lng: p.lng ?? 0,
      phone: p.entpTelno,
      hours: null,
    };
  });

  const withCoords = mirrorRows.filter(
    (r) => r.lat !== 0 || r.lng !== 0
  ).length;

  // 5) 기존 Store 조회 — 두 단계 매칭
  //   (a) externalId 매칭: 이미 미러된 row → 그대로 update
  //   (b) name 정규화 fallback: externalId가 null인 시드/사용자 row 중
  //       정규화된 이름이 일치하면 "adopt" — externalId만 채워서 같은 row로 통일.
  //       이렇게 안 하면 "이마트 천호점"(시드, ext=null)과 "이마트천호점"(parsa)이
  //       별개 row로 갈라져 가격이 후자에만 붙음.
  const externalIds = mirrorRows.map((r) => r.externalId);
  const existing = await prisma.store.findMany({
    where: { externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingSet = new Set(existing.map((e) => e.externalId).filter(Boolean));

  // 미러 후보 이름 → adopt 매칭에 쓸 정규화 키 집합
  const candidateNameKeys = new Set(mirrorRows.map((r) => normName(r.name)));
  const adoptCandidates = await prisma.store.findMany({
    where: { externalId: null },
    select: { id: true, name: true },
  });
  const adoptByKey = new Map<string, string>(); // normName → store.id
  for (const r of adoptCandidates) {
    const k = normName(r.name);
    if (candidateNameKeys.has(k) && !adoptByKey.has(k)) {
      adoptByKey.set(k, r.id);
    }
  }

  const toUpdate = mirrorRows.filter((r) => existingSet.has(r.externalId));
  const remaining = mirrorRows.filter((r) => !existingSet.has(r.externalId));
  const toAdopt = remaining.filter((r) => adoptByKey.has(normName(r.name)));
  const toInsert = remaining.filter((r) => !adoptByKey.has(normName(r.name)));

  // 6) 신규 createMany — 빠른 일괄 삽입
  let inserted = 0;
  if (toInsert.length > 0) {
    const res = await prisma.store.createMany({
      data: toInsert,
      skipDuplicates: true,
    });
    inserted = res.count;
  }

  // 6.5) adopt — 기존 ext=null row에 externalId 채우면서 동시에 메타 업데이트
  let adopted = 0;
  if (toAdopt.length > 0) {
    const CHUNK = 50;
    for (let i = 0; i < toAdopt.length; i += CHUNK) {
      const slice = toAdopt.slice(i, i + CHUNK);
      const results = await Promise.all(
        slice.map((r) => {
          const targetId = adoptByKey.get(normName(r.name))!;
          return prisma.store.update({
            where: { id: targetId },
            data: {
              externalId: r.externalId,
              chainId: r.chainId,
              name: r.name,
              address: r.address,
              lat: r.lat,
              lng: r.lng,
              phone: r.phone,
              hours: r.hours,
            },
          });
        })
      );
      adopted += results.length;
    }
  }

  // 7) 기존 row update — 50개 병렬 chunk
  let updated = 0;
  if (toUpdate.length > 0) {
    const CHUNK = 50;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const slice = toUpdate.slice(i, i + CHUNK);
      const results = await Promise.all(
        slice.map((r) =>
          prisma.store.updateMany({
            where: { externalId: r.externalId },
            data: {
              chainId: r.chainId,
              name: r.name,
              address: r.address,
              lat: r.lat,
              lng: r.lng,
              phone: r.phone,
              hours: r.hours,
            },
          })
        )
      );
      for (const u of results) updated += u.count;
    }
  }

  const processedThrough = startFrom + parsaStores.length;
  const partial = processedThrough < totalParsaStores;

  return NextResponse.json({
    ok: true,
    totalParsaStores,
    mirrored: inserted + adopted + updated,
    inserted,
    adopted,
    updated,
    withCoords,
    partial,
    processedThrough,
    sliceLimit,
    elapsedMs: Date.now() - startedAt,
  });
}
