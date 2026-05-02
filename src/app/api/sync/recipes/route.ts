import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import {
  fetchRecipesPage,
  parseRecipeRow,
  type RecipeParsed,
} from "@/lib/foodsafety/recipes";

export const maxDuration = 60;

// POST /api/sync/recipes — 식약처 조리식품 레시피 DB (COOKRCP01) 동기화
// RCP_SEQ 기준 upsert. Vercel Cron(매월 1일 03시) 또는 X-Sync-Token 인증.
//
// 전체 약 1,146건 — 페이지 크기 500으로 3 페이지면 충분.
// 시간 budget 50초. 페이지 단위 트랜잭션 upsert로 처리.
//
// Query params:
//   ?from=N : 시작 startIdx (이어받기). 미지정 시 1.
//   ?pages=N : 최대 페이지 수 제한 (테스트용).
export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 50_000;
  const PAGE_SIZE = 500;

  const url = new URL(req.url);
  const fromParam = parseInt(url.searchParams.get("from") ?? "1", 10);
  const startFrom = Number.isFinite(fromParam) && fromParam > 0 ? fromParam : 1;
  const maxPagesParam = parseInt(url.searchParams.get("pages") ?? "0", 10);
  const maxPages =
    Number.isFinite(maxPagesParam) && maxPagesParam > 0 ? maxPagesParam : Infinity;

  let startIdx = startFrom;
  let pageCount = 0;
  let fetched = 0;
  let inserted = 0;
  let updated = 0;
  let totalKnown = 0;
  let lastError: string | undefined;
  let partial = false;
  let processedThrough = startFrom - 1;

  while (true) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      partial = true;
      break;
    }
    if (pageCount >= maxPages) break;

    const endIdx = startIdx + PAGE_SIZE - 1;
    const { rows, total, error } = await fetchRecipesPage(startIdx, endIdx);
    if (total > 0) totalKnown = total;
    if (error) lastError = error;

    if (rows.length === 0) {
      processedThrough = endIdx;
      break;
    }

    fetched += rows.length;

    // 파싱 + 페이지 내 중복 제거 (recipeSeq 기준)
    const parsed: RecipeParsed[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const p = parseRecipeRow(r);
      if (!p) continue;
      if (seen.has(p.recipeSeq)) continue;
      seen.add(p.recipeSeq);
      parsed.push(p);
    }

    // 1) 한 번의 쿼리로 기존 recipeSeq 조회
    const existingRows = await prisma.recipe.findMany({
      where: { recipeSeq: { in: parsed.map((p) => p.recipeSeq) } },
      select: { recipeSeq: true },
    });
    const existingSet = new Set(existingRows.map((r) => r.recipeSeq));

    try {
      // 2) 신규는 createMany 일괄 삽입
      const toCreate = parsed
        .filter((p) => !existingSet.has(p.recipeSeq))
        .map((p) => ({
          recipeSeq: p.recipeSeq,
          name: p.name,
          cookingMethod: p.cookingMethod,
          category: p.category,
          servingWeight: p.servingWeight,
          caloriesKcal: p.caloriesKcal,
          carbsG: p.carbsG,
          proteinG: p.proteinG,
          fatG: p.fatG,
          sodiumMg: p.sodiumMg,
          hashtags: p.hashtags,
          imageMain: p.imageMain,
          imageBig: p.imageBig,
          ingredientsRaw: p.ingredientsRaw,
          ingredientsList: p.ingredientsList,
          steps: p.steps as unknown as object,
          tip: p.tip,
        }));
      if (toCreate.length > 0) {
        await prisma.recipe.createMany({ data: toCreate, skipDuplicates: true });
        inserted += toCreate.length;
      }

      // 3) 기존은 50개씩 병렬 update
      const toUpdate = parsed.filter((p) => existingSet.has(p.recipeSeq));
      const CHUNK = 50;
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        const slice = toUpdate.slice(i, i + CHUNK);
        await Promise.all(
          slice.map((p) =>
            prisma.recipe.update({
              where: { recipeSeq: p.recipeSeq },
              data: {
                name: p.name,
                cookingMethod: p.cookingMethod,
                category: p.category,
                servingWeight: p.servingWeight,
                caloriesKcal: p.caloriesKcal,
                carbsG: p.carbsG,
                proteinG: p.proteinG,
                fatG: p.fatG,
                sodiumMg: p.sodiumMg,
                hashtags: p.hashtags,
                imageMain: p.imageMain,
                imageBig: p.imageBig,
                ingredientsRaw: p.ingredientsRaw,
                ingredientsList: p.ingredientsList,
                steps: p.steps as unknown as object,
                tip: p.tip,
              },
            })
          )
        );
        updated += slice.length;
      }
    } catch (e) {
      lastError = `upsert 트랜잭션 실패: ${e instanceof Error ? e.message : String(e)}`;
    }

    processedThrough = endIdx;
    pageCount += 1;

    // total 도달 시 종료
    if (totalKnown > 0 && endIdx >= totalKnown) break;
    // 페이지 크기보다 적게 받았으면 끝
    if (rows.length < PAGE_SIZE) break;

    startIdx = endIdx + 1;
    // API rate limit 보호
    await new Promise((r) => setTimeout(r, 150));
  }

  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: !lastError || fetched > 0,
    fetched,
    inserted,
    updated,
    totalKnown,
    partial,
    processedThrough,
    pages: pageCount,
    elapsedMs,
    error: lastError,
  });
}
