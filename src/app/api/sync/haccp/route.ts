import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import {
  fetchHaccpPage,
  normalizeBsshName,
  type HaccpRow,
} from "@/lib/foodsafety/haccp";

export const maxDuration = 60;

// POST /api/sync/haccp — 식약처 HACCP 적용업소 지정 현황 (I0580) 동기화
// LCNS_NO(인허가번호) 기준 upsert. Vercel Cron(매주 일요일 04시) 또는 X-Sync-Token 인증.
//
// 시간 budget: 50초 — 초과 시 partial=true + processedThrough 반환해 다음 cron에서 이어받게.
// 페이지 크기 1000, 38,952건 → 39 페이지. createMany(skipDuplicates) + 변경분 upsert로 처리.
//
// Query params:
//   ?from=N : 시작 startIdx 지정 (이어받기). 미지정 시 1.
//   ?pages=N : 최대 페이지 수 제한 (테스트용).
export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 50_000;
  const PAGE_SIZE = 1000;

  const url = new URL(req.url);
  const fromParam = parseInt(url.searchParams.get("from") ?? "1", 10);
  const startFrom = Number.isFinite(fromParam) && fromParam > 0 ? fromParam : 1;
  const maxPagesParam = parseInt(url.searchParams.get("pages") ?? "0", 10);
  const maxPages = Number.isFinite(maxPagesParam) && maxPagesParam > 0 ? maxPagesParam : Infinity;
  // 기본은 createMany(skipDuplicates) only — 빠름. 기존 facility 정보 변경은 거의 없음.
  // ?updates=true 면 변경분 update 수행 (느림, 정확).
  const enableUpdates = url.searchParams.get("updates") === "true";

  let startIdx = startFrom;
  let pageCount = 0;
  let fetched = 0;
  let inserted = 0;
  let updated = 0;
  let totalKnown = 0;
  let lastError: string | undefined;
  let partial = false;
  let processedThrough = startFrom - 1;

  // 페이지 단위 루프
  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      partial = true;
      break;
    }
    if (pageCount >= maxPages) break;

    const endIdx = startIdx + PAGE_SIZE - 1;
    const { rows, total, error } = await fetchHaccpPage(startIdx, endIdx);
    if (total > 0) totalKnown = total;
    if (error) lastError = error;

    if (rows.length === 0) {
      // 더 이상 데이터 없거나 에러 — 종료
      processedThrough = endIdx;
      break;
    }

    fetched += rows.length;

    // 페이지 내 동일 licenseNo 중복 제거 (createMany 보호)
    const seen = new Set<string>();
    const dedup: HaccpRow[] = [];
    for (const r of rows) {
      if (seen.has(r.licenseNo)) continue;
      seen.add(r.licenseNo);
      dedup.push(r);
    }

    // 1) createMany(skipDuplicates) — 신규만 빠르게 삽입
    const createData = dedup.map((r) => ({
      licenseNo: r.licenseNo,
      bsshName: r.bsshName,
      bsshNameNorm: normalizeBsshName(r.bsshName),
      industryName: r.industryName ?? null,
      presidentName: r.presidentName ?? null,
      address: r.address ?? null,
      appnDate: r.appnDate ?? null,
      appnNo: r.appnNo ?? null,
      productListName: r.productListName ?? null,
      bizStatus: r.bizStatus ?? null,
      bizCloseDate: r.bizCloseDate ?? null,
    }));

    let insertedThisPage = 0;
    try {
      const res = await prisma.haccpFacility.createMany({
        data: createData,
        skipDuplicates: true,
      });
      insertedThisPage = res.count;
      inserted += insertedThisPage;
    } catch (e) {
      lastError = `createMany 실패: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 2) skipDuplicates된 건들 (이미 존재 = 업데이트 대상)에 대해 변경분 update
    //    insertedThisPage < dedup.length 이면 차이만큼 update 시도.
    //    enableUpdates=true 일 때만 수행 — 60초 budget 내 38k 처리 위해 기본 비활성.
    if (enableUpdates && insertedThisPage < dedup.length) {
      // 어떤 게 신규였는지 알 수 없으니, 전체에 대해 update.
      // 50개씩 병렬화하여 round-trip 최소화.
      try {
        const CHUNK = 50;
        for (let i = 0; i < dedup.length; i += CHUNK) {
          const slice = dedup.slice(i, i + CHUNK);
          await Promise.all(
            slice.map((r) =>
              prisma.haccpFacility.updateMany({
                where: { licenseNo: r.licenseNo },
                data: {
                  bsshName: r.bsshName,
                  bsshNameNorm: normalizeBsshName(r.bsshName),
                  industryName: r.industryName ?? null,
                  presidentName: r.presidentName ?? null,
                  address: r.address ?? null,
                  appnDate: r.appnDate ?? null,
                  appnNo: r.appnNo ?? null,
                  productListName: r.productListName ?? null,
                  bizStatus: r.bizStatus ?? null,
                  bizCloseDate: r.bizCloseDate ?? null,
                },
              })
            )
          );
        }
        updated += dedup.length - insertedThisPage;
      } catch (e) {
        lastError = `update 트랜잭션 실패: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    processedThrough = endIdx;
    pageCount += 1;

    // total을 알게 된 후, 끝에 도달했으면 종료
    if (totalKnown > 0 && endIdx >= totalKnown) break;
    // 페이지 크기보다 적게 받았으면 끝
    if (rows.length < PAGE_SIZE) break;

    startIdx = endIdx + 1;
    // API rate limit 보호
    await new Promise((r) => setTimeout(r, 150));
  }

  // 마지막 페이지까지 다 받았을 때만 Product.hasHaccp 갱신.
  // partial이면 다음 cron에서 마저 받은 후 갱신 (마지막 호출이 갱신 담당).
  let productsMatched = 0;
  let productMatchError: string | undefined;
  if (!partial) {
    try {
      productsMatched = await reconcileProductHaccp();
    } catch (e) {
      productMatchError = e instanceof Error ? e.message : String(e);
    }
  }

  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: !lastError || fetched > 0,
    fetched,
    inserted,
    updated,
    totalKnown,
    productsMatched,
    partial,
    processedThrough,
    pages: pageCount,
    elapsedMs,
    error: lastError,
    productMatchError,
  });
}

// HACCP DB와 Product.manufacturer 매칭 → Product.hasHaccp / haccpInfo 갱신.
// 매칭 룰:
//   - 폐업/취소 시설은 제외
//   - normalizedManufacturer 와 bsshNameNorm이 정확히 같거나 / 한쪽이 다른 쪽을 contains
//   - 다중 매칭 시 appnDate 최신값 선택
//   - 카테고리가 "농수산물"인 상품은 제외 (HACCP 대상 아님)
// 반환: hasHaccp=true로 갱신된 상품 수
async function reconcileProductHaccp(): Promise<number> {
  // 영업중 시설만 (폐업/취소 제외)
  const facilities = await prisma.haccpFacility.findMany({
    where: {
      NOT: [
        { bizStatus: { contains: "폐업" } },
        { bizStatus: { contains: "취소" } },
      ],
    },
    select: {
      licenseNo: true,
      bsshName: true,
      bsshNameNorm: true,
      appnDate: true,
      appnNo: true,
    },
  });

  // bsshNameNorm → 가장 최근 appnDate를 가진 facility
  const byNorm = new Map<
    string,
    { licenseNo: string; bsshName: string; appnDate: string | null; appnNo: string | null }
  >();
  for (const f of facilities) {
    const cur = byNorm.get(f.bsshNameNorm);
    const fDate = f.appnDate ?? "";
    if (!cur || (fDate > (cur.appnDate ?? ""))) {
      byNorm.set(f.bsshNameNorm, {
        licenseNo: f.licenseNo,
        bsshName: f.bsshName,
        appnDate: f.appnDate ?? null,
        appnNo: f.appnNo ?? null,
      });
    }
  }
  const norms = [...byNorm.keys()].filter((s) => s.length >= 2);

  // 매칭 대상 상품: manufacturer 있고 카테고리 != "농수산물"
  const products = await prisma.product.findMany({
    where: {
      manufacturer: { not: null },
      category: { not: "농수산물" },
    },
    select: { id: true, manufacturer: true, hasHaccp: true },
  });

  // 매칭 결과를 먼저 메모리에 모은 뒤 50개씩 병렬 update
  type UpdateOp =
    | {
        kind: "set";
        id: string;
        info: { licenseNo: string; bsshName: string; appnDate: string | null; appnNo: string | null };
      }
    | { kind: "clear"; id: string };

  const ops: UpdateOp[] = [];
  let matched = 0;

  for (const p of products) {
    if (!p.manufacturer) continue;
    const mNorm = normalizeBsshName(p.manufacturer);
    if (mNorm.length < 2) continue;

    let best: { licenseNo: string; bsshName: string; appnDate: string | null; appnNo: string | null } | null = null;

    // 1) 정확히 일치
    const exact = byNorm.get(mNorm);
    if (exact) {
      best = exact;
    } else {
      // 2) contains 양방향 — 가장 긴 매칭 + 최신 appnDate
      let bestLen = -1;
      let bestDate = "";
      for (const n of norms) {
        if (n === mNorm) continue;
        const isMatch = n.includes(mNorm) || mNorm.includes(n);
        if (!isMatch) continue;
        const cand = byNorm.get(n)!;
        const cDate = cand.appnDate ?? "";
        const len = Math.min(n.length, mNorm.length);
        // 매칭 길이 우선, 동률이면 appnDate 최신값
        if (len > bestLen || (len === bestLen && cDate > bestDate)) {
          best = cand;
          bestLen = len;
          bestDate = cDate;
        }
      }
    }

    if (best) {
      ops.push({
        kind: "set",
        id: p.id,
        info: {
          licenseNo: best.licenseNo,
          bsshName: best.bsshName,
          appnDate: best.appnDate,
          appnNo: best.appnNo,
        },
      });
      matched += 1;
    } else if (p.hasHaccp) {
      // 이전엔 매칭됐지만 이번엔 매칭 안 됨 (폐업/취소 등) → 끄기
      ops.push({ kind: "clear", id: p.id });
    }
  }

  // 50개씩 병렬 update
  const CHUNK = 50;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const slice = ops.slice(i, i + CHUNK);
    await Promise.all(
      slice.map((op) => {
        if (op.kind === "set") {
          return prisma.product.update({
            where: { id: op.id },
            data: { hasHaccp: true, haccpInfo: op.info },
          });
        }
        return prisma.product.update({
          where: { id: op.id },
          data: { hasHaccp: false, haccpInfo: Prisma.DbNull },
        });
      })
    );
  }

  return matched;
}
