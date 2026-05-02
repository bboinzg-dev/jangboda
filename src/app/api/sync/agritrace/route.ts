import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import {
  fetchAgriTracePage,
  fetchAgriDistributionPage,
  type AgriTraceRow,
  type AgriDistributionRow,
} from "@/lib/foodsafety/agritrace";

export const maxDuration = 60;

// POST /api/sync/agritrace — 식품안전나라 농산물이력추적 (I1790 + I1800) 동기화
// HIST_TRACE_REG_NO(이력추적등록번호) 기준 upsert. Vercel Cron 또는 X-Sync-Token 인증.
//
// 시간 budget: 50초 — 초과 시 partial=true + processedThrough 반환해 다음 cron에서 이어받게.
// 페이지 크기 1000, 약 6,424건 → 7 페이지. Phase 1(I1790) 완료 후 Phase 2(I1800 거래처) 머지.
//
// Query params:
//   ?from=N : Phase 1 시작 startIdx 지정 (이어받기). 미지정 시 1.
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
  const maxPages =
    Number.isFinite(maxPagesParam) && maxPagesParam > 0 ? maxPagesParam : Infinity;

  let startIdx = startFrom;
  let pageCount = 0;
  let fetchedI1790 = 0;
  let fetchedI1800 = 0;
  let inserted = 0;
  let updated = 0;
  let partnersAttached = 0;
  let totalKnown = 0;
  let lastError: string | undefined;
  let partial = false;
  let processedThrough = startFrom - 1;

  // ─────────── Phase 1: I1790 — 농산물이력추적 기본 정보 upsert ───────────
  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      partial = true;
      break;
    }
    if (pageCount >= maxPages) break;

    const endIdx = startIdx + PAGE_SIZE - 1;
    const { rows, total, error } = await fetchAgriTracePage(startIdx, endIdx);
    if (total > 0) totalKnown = total;
    if (error) lastError = error;

    if (rows.length === 0) {
      processedThrough = endIdx;
      break;
    }

    fetchedI1790 += rows.length;

    // 페이지 내 동일 histTraceRegNo 중복 제거
    const seen = new Set<string>();
    const dedup: AgriTraceRow[] = [];
    for (const r of rows) {
      if (seen.has(r.histTraceRegNo)) continue;
      seen.add(r.histTraceRegNo);
      dedup.push(r);
    }

    // 기존 레코드 조회 (insert/update 카운팅용)
    const existingRecords = await prisma.agriTrace.findMany({
      where: { histTraceRegNo: { in: dedup.map((r) => r.histTraceRegNo) } },
      select: { histTraceRegNo: true },
    });
    const existingSet = new Set(existingRecords.map((r) => r.histTraceRegNo));

    // 트랜잭션으로 upsert 일괄 — createMany skipDuplicates는 update 안 됨, partners 보존 위해 upsert.
    try {
      await prisma.$transaction(
        dedup.map((r) =>
          prisma.agriTrace.upsert({
            where: { histTraceRegNo: r.histTraceRegNo },
            create: {
              histTraceRegNo: r.histTraceRegNo,
              regInstName: r.regInstName ?? null,
              rprsntPrdltName: r.rprsntPrdltName,
              presidentName: r.presidentName ?? null,
              orgnName: r.orgnName ?? null,
              validBeginDate: r.validBeginDate ?? null,
              validEndDate: r.validEndDate ?? null,
            },
            update: {
              regInstName: r.regInstName ?? null,
              rprsntPrdltName: r.rprsntPrdltName,
              presidentName: r.presidentName ?? null,
              orgnName: r.orgnName ?? null,
              validBeginDate: r.validBeginDate ?? null,
              validEndDate: r.validEndDate ?? null,
              // partners는 Phase 2에서 별도 갱신 — 여기선 건드리지 않음
            },
          })
        )
      );
      for (const r of dedup) {
        if (existingSet.has(r.histTraceRegNo)) updated += 1;
        else inserted += 1;
      }
    } catch (e) {
      lastError = `upsert 트랜잭션 실패: ${e instanceof Error ? e.message : String(e)}`;
    }

    processedThrough = endIdx;
    pageCount += 1;

    if (totalKnown > 0 && endIdx >= totalKnown) break;
    if (rows.length < PAGE_SIZE) break;

    startIdx = endIdx + 1;
    // API rate limit 보호
    await new Promise((r) => setTimeout(r, 150));
  }

  // ─────────── Phase 2: I1800 — 거래처 정보 머지 (Phase 1 완료 시만) ───────────
  if (!partial) {
    // 522건이라 1페이지(1~1000)면 충분
    let distStart = 1;
    const allDistRows: AgriDistributionRow[] = [];
    while (true) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        partial = true;
        break;
      }
      const distEnd = distStart + PAGE_SIZE - 1;
      const { rows, total, error } = await fetchAgriDistributionPage(distStart, distEnd);
      if (error) lastError = error;
      if (rows.length === 0) break;
      allDistRows.push(...rows);
      fetchedI1800 += rows.length;
      if (total > 0 && distEnd >= total) break;
      if (rows.length < PAGE_SIZE) break;
      distStart = distEnd + 1;
      await new Promise((r) => setTimeout(r, 150));
    }

    // HIST_TRACE_REG_NO 기준 그룹화
    const grouped = new Map<
      string,
      Array<{ grpName: string; presidentName?: string; telno?: string }>
    >();
    for (const d of allDistRows) {
      const arr = grouped.get(d.histTraceRegNo) ?? [];
      arr.push({
        grpName: d.grpName,
        presidentName: d.presidentName,
        telno: d.telno,
      });
      grouped.set(d.histTraceRegNo, arr);
    }

    // 각 그룹별로 update — 레코드 없으면 (P2025) skip
    for (const [regNo, partners] of grouped.entries()) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        partial = true;
        break;
      }
      try {
        await prisma.agriTrace.update({
          where: { histTraceRegNo: regNo },
          data: { partners: partners as unknown as Prisma.InputJsonValue },
        });
        partnersAttached += 1;
      } catch (e) {
        // P2025: Record to update not found — I1790에 없는 거래처는 skip
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
          continue;
        }
        lastError = `partners update 실패(${regNo}): ${e instanceof Error ? e.message : String(e)}`;
      }
    }
  }

  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: !lastError || fetchedI1790 > 0,
    fetchedI1790,
    fetchedI1800,
    inserted,
    updated,
    partnersAttached,
    totalKnown,
    partial,
    processedThrough,
    pages: pageCount,
    elapsedMs,
    error: lastError,
  });
}
