"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type RecommendedRecipe = {
  id: string;
  recipeSeq: string;
  name: string;
  category: string | null;
  cookingMethod: string | null;
  caloriesKcal: number | null;
  imageMain: string | null;
  ingredientsList: string[];
  matchCount: number;
  totalIngredients: number;
  matchedIngredients: string[];
};

type Props = {
  /** 장바구니 상품명 리스트 (Product.name 그대로 — 서버에서 부분 매칭) */
  productNames: string[];
};

// 장바구니 재료로 만들 수 있는 요리 추천
// /api/recipes?ingredients=... 호출 → matchCount 내림차순 상위 5개 표시
export default function RecipeRecommendations({ productNames }: Props) {
  const [recipes, setRecipes] = useState<RecommendedRecipe[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const cleaned = productNames
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);

    if (cleaned.length === 0) {
      setRecipes([]);
      return;
    }

    // 서버가 정규 카테고리(우유/계란/...)로 매핑하므로 상품명 그대로 전달
    const ingredients = cleaned.slice(0, 30);

    setLoading(true);
    const url = `/api/recipes?ingredients=${encodeURIComponent(
      ingredients.join(",")
    )}&limit=5`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setRecipes((data.recipes ?? []) as RecommendedRecipe[]);
      })
      .catch(() => {
        setRecipes([]);
      })
      .finally(() => setLoading(false));
  }, [productNames]);

  if (productNames.length === 0) return null;

  return (
    <section className="bg-white border border-border rounded-xl p-4 md:p-5">
      <h2 className="font-bold mb-1 flex items-center gap-2">
        🍳 이 재료로 만들 수 있는 요리
      </h2>
      <p className="text-xs text-stone-500 mb-3">
        장바구니 재료를 활용한 추천 레시피 (식약처 조리식품 레시피 DB)
      </p>

      {loading && (
        <div className="text-sm text-stone-500 text-center py-6">
          레시피 찾는 중...
        </div>
      )}

      {!loading && recipes !== null && recipes.length === 0 && (
        <div className="text-sm text-stone-500 text-center py-6 border border-dashed border-border rounded-lg">
          장바구니 재료로 만들 수 있는 등록 레시피가 없습니다.
          <br />
          <Link
            href="/recipes"
            className="text-brand-600 hover:underline text-xs mt-2 inline-block"
          >
            전체 레시피 둘러보기 →
          </Link>
        </div>
      )}

      {!loading && recipes && recipes.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {recipes.map((r) => (
            <li key={r.id}>
              <Link
                href={`/recipes/${r.id}`}
                className="card-clickable flex gap-3 p-2 border border-border rounded-lg hover:border-brand-300 hover:bg-brand-50/30 transition"
              >
                <div className="shrink-0 w-16 h-16 rounded-lg bg-stone-100 overflow-hidden flex items-center justify-center text-stone-300 text-2xl">
                  {r.imageMain ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imageMain}
                      alt={r.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    "🍽️"
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {r.category && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">
                        {r.category}
                      </span>
                    )}
                    <span className="text-[10px] bg-success-soft text-success-text px-1.5 py-0.5 rounded font-bold">
                      주재료 {r.totalIngredients}종 중 {r.matchCount}종 보유
                    </span>
                  </div>
                  <div className="font-semibold text-sm text-stone-900 truncate mt-0.5">
                    {r.name}
                  </div>
                  {r.matchedIngredients.length > 0 && (
                    <div className="text-[11px] text-stone-500 truncate mt-0.5">
                      ✓ {r.matchedIngredients.slice(0, 5).join(", ")}
                    </div>
                  )}
                  {r.caloriesKcal !== null && (
                    <div className="text-[11px] text-stone-400 mt-0.5">
                      🔥 {Math.round(r.caloriesKcal)}kcal
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!loading && recipes && recipes.length > 0 && (
        <div className="text-center mt-3">
          <Link
            href="/recipes"
            className="text-xs text-brand-600 hover:underline"
          >
            전체 레시피 둘러보기 →
          </Link>
        </div>
      )}
    </section>
  );
}
