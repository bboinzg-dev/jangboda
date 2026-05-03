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

// 가상 chain 식별 — 한국소비자원에서 일괄 수집한 매장이라는 출처를 명확히 표시.
// 사용자가 "이마트연수점"을 봤을 때 "한국소비자원 등록 매장 / [대형마트] 이마트연수점" 식으로 노출.
const MIRROR_CHAIN_NAME = "한국소비자원 등록 매장";
const MIRROR_CHAIN_CATEGORY = "public";

export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();

  // 1) 가상 Chain upsert
  const chain = await prisma.chain.upsert({
    where: { name: MIRROR_CHAIN_NAME },
    update: { category: MIRROR_CHAIN_CATEGORY },
    create: { name: MIRROR_CHAIN_NAME, category: MIRROR_CHAIN_CATEGORY },
  });

  // 2) entpTypeCode → 한글 이름 룩업 테이블 (ParsaCategory의 BU 클래스).
  //    예: LM → "대형마트", SM → "슈퍼마켓"
  //    BU 데이터가 비어있을 수 있으므로 빈 Map이어도 fallback(코드 그대로) 처리.
  const buRows = await prisma.parsaCategory.findMany({
    where: { classCode: "BU" },
    select: { code: true, codeName: true },
  });
  const typeNameMap = new Map<string, string>();
  for (const r of buRows) typeNameMap.set(r.code, r.codeName);

  // 3) ParsaStore 전체 조회
  const parsaStores = await prisma.parsaStore.findMany({
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
  const totalParsaStores = parsaStores.length;

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

  const mirrorRows: MirrorRow[] = parsaStores.map((p) => {
    const typeName = p.entpTypeCode
      ? typeNameMap.get(p.entpTypeCode) ?? p.entpTypeCode
      : null;
    const name = typeName ? `[${typeName}] ${p.entpName}` : p.entpName;
    const address = p.roadAddrBasic ?? p.addrBasic ?? "주소 미상";
    return {
      externalId: `parsa:${p.entpId}`,
      chainId: chain.id,
      name,
      address,
      // 좌표 없는 매장은 0,0 (지도 표시 안 됨)
      lat: p.lat ?? 0,
      lng: p.lng ?? 0,
      phone: p.entpTelno,
      hours: null,
    };
  });

  const withCoords = mirrorRows.filter(
    (r) => r.lat !== 0 || r.lng !== 0
  ).length;

  // 5) 기존 Store 조회 (externalId 기준)
  const externalIds = mirrorRows.map((r) => r.externalId);
  const existing = await prisma.store.findMany({
    where: { externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingSet = new Set(existing.map((e) => e.externalId).filter(Boolean));

  const toInsert = mirrorRows.filter((r) => !existingSet.has(r.externalId));
  const toUpdate = mirrorRows.filter((r) => existingSet.has(r.externalId));

  // 6) 신규 createMany — 빠른 일괄 삽입
  let inserted = 0;
  if (toInsert.length > 0) {
    const res = await prisma.store.createMany({
      data: toInsert,
      skipDuplicates: true,
    });
    inserted = res.count;
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

  return NextResponse.json({
    ok: true,
    totalParsaStores,
    mirrored: inserted + updated,
    inserted,
    updated,
    withCoords,
    elapsedMs: Date.now() - startedAt,
  });
}
