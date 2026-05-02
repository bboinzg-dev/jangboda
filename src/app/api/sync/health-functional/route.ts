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

      // 1) 한 번의 쿼리로 기존 groupCode 조회
      const existingCodes = new Set(
        (
          await prisma.healthFunctionalCategory.findMany({
            where: { groupCode: { in: dedup.map((r) => r.groupCode) } },
            select: { groupCode: true },
          })
        ).map((r) => r.groupCode)
      );

      try {
        // 2) 신규는 createMany 일괄 삽입
        const toCreate = dedup
          .filter((r) => !existingCodes.has(r.groupCode))
          .map((r) => ({
            groupCode: r.groupCode,
            groupName: r.groupName,
            largeCategoryCode: r.largeCategoryCode ?? null,
            largeCategoryName: r.largeCategoryName ?? null,
            midCategoryCode: r.midCategoryCode ?? null,
            midCategoryName: r.midCategoryName ?? null,
            smallCategoryCode: r.smallCategoryCode ?? null,
            smallCategoryName: r.smallCategoryName ?? null,
          }));
        if (toCreate.length > 0) {
          await prisma.healthFunctionalCategory.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
          categoriesInserted += toCreate.length;
        }

        // 3) 기존은 50개씩 병렬 update
        const toUpdate = dedup.filter((r) => existingCodes.has(r.groupCode));
        const CHUNK = 50;
        for (let i = 0; i < toUpdate.length; i += CHUNK) {
          const slice = toUpdate.slice(i, i + CHUNK);
          await Promise.all(
            slice.map((r) =>
              prisma.healthFunctionalCategory.update({
                where: { groupCode: r.groupCode },
                data: {
                  groupName: r.groupName,
                  largeCategoryCode: r.largeCategoryCode ?? null,
                  largeCategoryName: r.largeCategoryName ?? null,
                  midCategoryCode: r.midCategoryCode ?? null,
                  midCategoryName: r.midCategoryName ?? null,
                  smallCategoryCode: r.smallCategoryCode ?? null,
                  smallCategoryName: r.smallCategoryName ?? null,
                },
              })
            )
          );
          categoriesUpdated += slice.length;
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

      // 1) 한 번의 쿼리로 기존 recognitionNo 조회
      const existingNos = new Set(
        (
          await prisma.healthFunctionalRawMaterial.findMany({
            where: { recognitionNo: { in: dedup.map((r) => r.recognitionNo) } },
            select: { recognitionNo: true },
          })
        ).map((r) => r.recognitionNo)
      );

      try {
        // 2) 신규는 createMany 일괄 삽입
        const toCreate = dedup
          .filter((r) => !existingNos.has(r.recognitionNo))
          .map((r) => ({
            recognitionNo: r.recognitionNo,
            rawMaterialName: r.rawMaterialName,
            weightUnit: r.weightUnit ?? null,
            dailyIntakeMin: r.dailyIntakeMin ?? null,
            dailyIntakeMax: r.dailyIntakeMax ?? null,
            primaryFunction: r.primaryFunction ?? null,
            warning: r.warning ?? null,
          }));
        if (toCreate.length > 0) {
          await prisma.healthFunctionalRawMaterial.createMany({
            data: toCreate,
            skipDuplicates: true,
          });
          rawMaterialsInserted += toCreate.length;
        }

        // 3) 기존은 50개씩 병렬 update
        const toUpdate = dedup.filter((r) => existingNos.has(r.recognitionNo));
        const CHUNK = 50;
        for (let i = 0; i < toUpdate.length; i += CHUNK) {
          const slice = toUpdate.slice(i, i + CHUNK);
          await Promise.all(
            slice.map((r) =>
              prisma.healthFunctionalRawMaterial.update({
                where: { recognitionNo: r.recognitionNo },
                data: {
                  rawMaterialName: r.rawMaterialName,
                  weightUnit: r.weightUnit ?? null,
                  dailyIntakeMin: r.dailyIntakeMin ?? null,
                  dailyIntakeMax: r.dailyIntakeMax ?? null,
                  primaryFunction: r.primaryFunction ?? null,
                  warning: r.warning ?? null,
                },
              })
            )
          );
          rawMaterialsUpdated += slice.length;
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
