import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import {
  fetchHealthCategoryPage,
  fetchHealthRawMaterialPage,
  type HealthCategoryRow,
  type HealthRawMaterialRow,
} from "@/lib/foodsafety/healthFunctional";

export const maxDuration = 60;

// POST /api/sync/health-functional
// 식약처 건강기능식품 동기화 — 두 단계 sequential:
//   1) I0760 영양카테고리 (585건) → upsert by groupCode
//   2) I-0050 개별인정형 원료 (428건) → upsert by recognitionNo
// 페이지 크기 500. 총 ~1000건 → 60초 내 완료.
export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  const PAGE_SIZE = 500;

  let categoriesInserted = 0;
  let categoriesUpdated = 0;
  let rawMaterialsInserted = 0;
  let rawMaterialsUpdated = 0;
  let totalCategoriesKnown = 0;
  let totalRawMaterialsKnown = 0;
  let lastError: string | undefined;

  // ----------- Phase 1: I0760 영양카테고리 -----------
  {
    let startIdx = 1;
    while (true) {
      const endIdx = startIdx + PAGE_SIZE - 1;
      const { rows, total, error } = await fetchHealthCategoryPage(
        startIdx,
        endIdx
      );
      if (total > 0) totalCategoriesKnown = total;
      if (error) lastError = error;
      if (rows.length === 0) break;

      // 페이지 내 중복 제거 (같은 groupCode)
      const seen = new Set<string>();
      const dedup: HealthCategoryRow[] = [];
      for (const r of rows) {
        if (seen.has(r.groupCode)) continue;
        seen.add(r.groupCode);
        dedup.push(r);
      }

      // 신규/업데이트 분기 위해 기존 PK 조회
      const existingCodes = new Set(
        (
          await prisma.healthFunctionalCategory.findMany({
            where: { groupCode: { in: dedup.map((r) => r.groupCode) } },
            select: { groupCode: true },
          })
        ).map((r) => r.groupCode)
      );

      const upserts = dedup.map((r) =>
        prisma.healthFunctionalCategory.upsert({
          where: { groupCode: r.groupCode },
          create: {
            groupCode: r.groupCode,
            groupName: r.groupName,
            largeCategoryCode: r.largeCategoryCode ?? null,
            largeCategoryName: r.largeCategoryName ?? null,
            midCategoryCode: r.midCategoryCode ?? null,
            midCategoryName: r.midCategoryName ?? null,
            smallCategoryCode: r.smallCategoryCode ?? null,
            smallCategoryName: r.smallCategoryName ?? null,
          },
          update: {
            groupName: r.groupName,
            largeCategoryCode: r.largeCategoryCode ?? null,
            largeCategoryName: r.largeCategoryName ?? null,
            midCategoryCode: r.midCategoryCode ?? null,
            midCategoryName: r.midCategoryName ?? null,
            smallCategoryCode: r.smallCategoryCode ?? null,
            smallCategoryName: r.smallCategoryName ?? null,
          },
        })
      );

      try {
        await prisma.$transaction(upserts);
        for (const r of dedup) {
          if (existingCodes.has(r.groupCode)) categoriesUpdated += 1;
          else categoriesInserted += 1;
        }
      } catch (e) {
        lastError = `카테고리 upsert 실패: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }

      // 종료 조건
      if (totalCategoriesKnown > 0 && endIdx >= totalCategoriesKnown) break;
      if (rows.length < PAGE_SIZE) break;

      startIdx = endIdx + 1;
      // rate limit 보호
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // ----------- Phase 2: I-0050 개별인정형 원료 -----------
  {
    let startIdx = 1;
    while (true) {
      const endIdx = startIdx + PAGE_SIZE - 1;
      const { rows, total, error } = await fetchHealthRawMaterialPage(
        startIdx,
        endIdx
      );
      if (total > 0) totalRawMaterialsKnown = total;
      if (error) lastError = error;
      if (rows.length === 0) break;

      const seen = new Set<string>();
      const dedup: HealthRawMaterialRow[] = [];
      for (const r of rows) {
        if (seen.has(r.recognitionNo)) continue;
        seen.add(r.recognitionNo);
        dedup.push(r);
      }

      const existingNos = new Set(
        (
          await prisma.healthFunctionalRawMaterial.findMany({
            where: { recognitionNo: { in: dedup.map((r) => r.recognitionNo) } },
            select: { recognitionNo: true },
          })
        ).map((r) => r.recognitionNo)
      );

      const upserts = dedup.map((r) =>
        prisma.healthFunctionalRawMaterial.upsert({
          where: { recognitionNo: r.recognitionNo },
          create: {
            recognitionNo: r.recognitionNo,
            rawMaterialName: r.rawMaterialName,
            weightUnit: r.weightUnit ?? null,
            dailyIntakeMin: r.dailyIntakeMin ?? null,
            dailyIntakeMax: r.dailyIntakeMax ?? null,
            primaryFunction: r.primaryFunction ?? null,
            warning: r.warning ?? null,
          },
          update: {
            rawMaterialName: r.rawMaterialName,
            weightUnit: r.weightUnit ?? null,
            dailyIntakeMin: r.dailyIntakeMin ?? null,
            dailyIntakeMax: r.dailyIntakeMax ?? null,
            primaryFunction: r.primaryFunction ?? null,
            warning: r.warning ?? null,
          },
        })
      );

      try {
        await prisma.$transaction(upserts);
        for (const r of dedup) {
          if (existingNos.has(r.recognitionNo)) rawMaterialsUpdated += 1;
          else rawMaterialsInserted += 1;
        }
      } catch (e) {
        lastError = `원료 upsert 실패: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }

      if (totalRawMaterialsKnown > 0 && endIdx >= totalRawMaterialsKnown) break;
      if (rows.length < PAGE_SIZE) break;

      startIdx = endIdx + 1;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: !lastError || (categoriesInserted + categoriesUpdated + rawMaterialsInserted + rawMaterialsUpdated) > 0,
    categoriesInserted,
    categoriesUpdated,
    rawMaterialsInserted,
    rawMaterialsUpdated,
    totalCategoriesKnown,
    totalRawMaterialsKnown,
    elapsedMs,
    error: lastError,
  });
}
