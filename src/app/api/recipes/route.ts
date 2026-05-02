import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  buildIngredientIndex,
  normalizeIngredient,
  uniqueCategories,
} from "@/lib/foodIngredientCategories";

// GET /api/recipes — 조리식품 레시피 검색/추천 API (인증 불필요)
//
// Query params:
//   ?q=닭갈비             : 메뉴명 또는 재료 부분일치
//   ?category=일품         : RCP_PAT2 (반찬/국&찌개/후식/밥/일품)
//   ?ingredient=양파       : 단일 재료 토큰 매칭
//   ?ingredients=양파,당근,돼지고기 : 다중 재료 매칭 — matchCount 내림차순으로 정렬
//   ?limit=20              : 최대 100
//
// 캐시: 1시간 CDN, 24시간 stale-while-revalidate.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category")?.trim() ?? "";
  const ingredient = searchParams.get("ingredient")?.trim() ?? "";
  const ingredientsParam = searchParams.get("ingredients")?.trim() ?? "";
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
    100
  );

  // 다중 재료 모드 — 정규 카테고리 기반 매칭
  if (ingredientsParam) {
    const inputs = ingredientsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (inputs.length === 0) {
      return jsonOk({ recipes: [] });
    }

    // 사용자 보유 재료를 정규 카테고리로 통일 (예: "매일우유 저지방"→"우유")
    const userCategories = uniqueCategories(inputs);
    if (userCategories.length === 0) {
      return jsonOk({ recipes: [], query: { inputs, userCategories: [] } });
    }

    // 후보 검색: 정규 카테고리에 해당하는 raw 키워드를 모아 hasSome OR contains 후보 추출
    // hasSome은 정확 일치만이므로 ingredientsRaw contains로 폭넓게 잡음
    const orConditions: Prisma.RecipeWhereInput[] = userCategories.map(
      (cat) => ({ ingredientsRaw: { contains: cat } })
    );
    const where: Prisma.RecipeWhereInput = { OR: orConditions };
    if (category) where.category = category;

    const candidates = await prisma.recipe.findMany({
      where,
      take: 500,
    });

    // 각 후보를 정규 카테고리 기준으로 점수 계산
    const userCatSet = new Set(userCategories);
    const scored = candidates.map((r) => {
      const { categories: recipeCats } = buildIngredientIndex(r.ingredientsList);
      // ingredientsRaw에서 추가 카테고리 추출 (ingredientsList 파싱이 빠뜨린 항목 보강)
      if (r.ingredientsRaw) {
        for (const cat of userCategories) {
          if (r.ingredientsRaw.includes(cat)) recipeCats.add(cat);
        }
        // 사용자 카테고리 외에도 raw에서 토큰 추출 시도 (총 재료 수 정확도)
        const rawTokens = r.ingredientsRaw
          .split(/[,、\n·]/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2);
        for (const t of rawTokens) {
          const c = normalizeIngredient(t);
          if (c) recipeCats.add(c);
        }
      }
      const matched = [...recipeCats].filter((c) => userCatSet.has(c));
      return {
        recipe: r,
        matchCount: matched.length,
        totalIngredients: recipeCats.size,
        matchedIngredients: matched,
      };
    });

    // 정렬: 매칭 비율(matched/total) 우선, 동률시 절대 매칭수
    scored.sort((a, b) => {
      const ratioA =
        a.totalIngredients > 0 ? a.matchCount / a.totalIngredients : 0;
      const ratioB =
        b.totalIngredients > 0 ? b.matchCount / b.totalIngredients : 0;
      if (Math.abs(ratioB - ratioA) > 0.01) return ratioB - ratioA;
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return a.totalIngredients - b.totalIngredients;
    });

    const top = scored
      .filter((s) => s.matchCount > 0)
      .slice(0, limit)
      .map((s) => ({
        id: s.recipe.id,
        recipeSeq: s.recipe.recipeSeq,
        name: s.recipe.name,
        category: s.recipe.category,
        cookingMethod: s.recipe.cookingMethod,
        caloriesKcal: s.recipe.caloriesKcal,
        imageMain: s.recipe.imageMain,
        ingredientsList: s.recipe.ingredientsList,
        matchCount: s.matchCount,
        totalIngredients: s.totalIngredients,
        matchedIngredients: s.matchedIngredients,
      }));

    return jsonOk({
      recipes: top,
      query: { inputs, userCategories },
    });
  }

  // 일반 검색 모드
  const where: Prisma.RecipeWhereInput = {};
  if (category) where.category = category;
  if (ingredient) where.ingredientsList = { has: ingredient };
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { ingredientsList: { has: q } },
      { ingredientsRaw: { contains: q } },
    ];
  }

  const recipes = await prisma.recipe.findMany({
    where,
    orderBy: { name: "asc" },
    take: limit,
    select: {
      id: true,
      recipeSeq: true,
      name: true,
      category: true,
      cookingMethod: true,
      caloriesKcal: true,
      imageMain: true,
      hashtags: true,
    },
  });

  return jsonOk({ recipes });
}

function jsonOk(payload: unknown) {
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
