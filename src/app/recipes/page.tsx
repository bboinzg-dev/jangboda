import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// ISR — 1시간 캐시. 레시피 데이터는 월 1회 동기화라 1시간 충분.
export const revalidate = 3600;

type SearchParams = {
  q?: string;
  category?: string;
  page?: string;
};

const PAGE_SIZE = 20;

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const category = (sp.category ?? "").trim();
  const page = Math.max(parseInt(sp.page ?? "1", 10) || 1, 1);

  const where: Prisma.RecipeWhereInput = {};
  if (category) where.category = category;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { ingredientsList: { has: q } },
      { ingredientsRaw: { contains: q } },
    ];
  }

  // 카테고리 칩 + total count 병렬화 (둘 다 findMany/count 직전 의존성 없음)
  const [categoryRows, total] = await Promise.all([
    prisma.recipe.findMany({
      where: { category: { not: null } },
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
    prisma.recipe.count({ where }),
  ]);
  const categories = categoryRows
    .map((r) => r.category)
    .filter((c): c is string => !!c);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const safePage = Math.min(page, totalPages);

  const recipes = await prisma.recipe.findMany({
    where,
    orderBy: { name: "asc" },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      category: true,
      cookingMethod: true,
      caloriesKcal: true,
      imageMain: true,
      hashtags: true,
    },
  });

  // 페이지 링크 빌더
  const linkFor = (overrides: Partial<SearchParams>) => {
    const params = new URLSearchParams();
    const qV = overrides.q ?? q;
    const catV = overrides.category ?? category;
    const pV = overrides.page ?? "1";
    if (qV) params.set("q", qV);
    if (catV) params.set("category", catV);
    if (pV && pV !== "1") params.set("page", pV);
    const qs = params.toString();
    return qs ? `/recipes?${qs}` : "/recipes";
  };

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
          🍳 레시피 둘러보기
        </h1>
        <p className="text-sm text-stone-600">
          식약처 조리식품 레시피 DB. 메뉴명이나 재료로 검색해보세요.
        </p>
      </header>

      {/* 검색창 — GET form */}
      <form className="flex gap-2" method="get">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="메뉴명 또는 재료 (예: 김치, 닭, 양파)"
          className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
        />
        {category && <input type="hidden" name="category" value={category} />}
        <button
          type="submit"
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium"
        >
          검색
        </button>
      </form>

      {/* 카테고리 칩 */}
      {categories.length > 0 && (
        <nav className="flex gap-2 flex-wrap">
          <Link
            href={linkFor({ category: "" })}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              !category
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
            }`}
          >
            전체
          </Link>
          {categories.map((c) => {
            const active = c === category;
            return (
              <Link
                key={c}
                href={linkFor({ category: c })}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                  active
                    ? "bg-stone-900 text-white border-stone-900"
                    : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
                }`}
              >
                {c}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="text-xs text-stone-500">
        총 {total.toLocaleString()}개 레시피
        {q && ` · "${q}"`}
        {category && ` · ${category}`}
      </div>

      {/* 결과 카드 그리드 */}
      {recipes.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">🍽️</div>
          <h2 className="font-bold mb-1">조건에 맞는 레시피가 없어요</h2>
          <p className="text-sm text-stone-500">
            다른 키워드로 검색해보세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {recipes.map((r) => (
            <Link
              key={r.id}
              href={`/recipes/${r.id}`}
              className="card-clickable card overflow-hidden hover:shadow-md transition flex flex-col"
            >
              <div className="aspect-square bg-stone-100 relative overflow-hidden">
                {r.imageMain ? (
                  // COOKRCP01은 http URL을 반환 — next/image remotePatterns 회피 위해 plain img
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.imageMain}
                    alt={r.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-stone-300 text-3xl">
                    🍽️
                  </div>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col gap-1">
                <div className="flex items-center gap-1 flex-wrap">
                  {r.category && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">
                      {r.category}
                    </span>
                  )}
                  {r.cookingMethod && (
                    <span className="text-[10px] text-stone-500">
                      {r.cookingMethod}
                    </span>
                  )}
                </div>
                <div className="font-semibold text-sm text-stone-900 line-clamp-2 leading-snug">
                  {r.name}
                </div>
                {r.caloriesKcal !== null && (
                  <div className="text-[11px] text-stone-500 mt-auto">
                    🔥 {Math.round(r.caloriesKcal)}kcal
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-4">
          {safePage > 1 && (
            <Link
              href={linkFor({ page: String(safePage - 1) })}
              className="px-3 py-1.5 rounded-lg text-sm border border-stone-200 bg-white hover:bg-stone-50"
            >
              ← 이전
            </Link>
          )}
          <span className="text-xs text-stone-500 px-2">
            {safePage} / {totalPages}
          </span>
          {safePage < totalPages && (
            <Link
              href={linkFor({ page: String(safePage + 1) })}
              className="px-3 py-1.5 rounded-lg text-sm border border-stone-200 bg-white hover:bg-stone-50"
            >
              다음 →
            </Link>
          )}
        </nav>
      )}

      <footer className="text-[11px] text-stone-400 pt-2">
        출처: 식품의약품안전처 식품안전나라 · 조리식품 레시피 DB (COOKRCP01)
      </footer>
    </div>
  );
}
