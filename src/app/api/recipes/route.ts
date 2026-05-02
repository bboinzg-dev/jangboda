import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

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

  // 다중 재료 모드 — matchCount 기준 정렬
  if (ingredientsParam) {
    const ingredients = ingredientsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (ingredients.length === 0) {
      return jsonOk({ recipes: [] });
    }

    // 후보 1차 필터: 어느 한 재료라도 포함 (Postgres String[] hasSome)
    const where: Prisma.RecipeWhereInput = {
      ingredientsList: { hasSome: ingredients },
    };
    if (category) where.category = category;

    const candidates = await prisma.recipe.findMany({
      where,
      take: 500, // 후보군 충분히 가져온 뒤 매칭 점수 계산
    });

    // 각 후보의 matchCount/totalIngredients 계산
    const scored = candidates.map((r) => {
      const have = new Set(r.ingredientsList);
      const matched = ingredients.filter((ing) => {
        if (have.has(ing)) return true;
        // 부분 일치 보조 — "돼지고기"가 "돼지고기앞다리살"과 매칭되도록
        for (const tok of r.ingredientsList) {
          if (tok.includes(ing) || ing.includes(tok)) return true;
        }
        return false;
      });
      return {
        recipe: r,
        matchCount: matched.length,
        totalIngredients: r.ingredientsList.length,
        matchedIngredients: matched,
      };
    });

    scored.sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      // 동률이면 totalIngredients 적은 것 우선 — "재료 적게 들어가는 요리"
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

    return jsonOk({ recipes: top, query: { ingredients } });
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
