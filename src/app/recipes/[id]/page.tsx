import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { RecipeStep } from "@/lib/foodsafety/recipes";

export const revalidate = 3600;

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { id },
  });
  if (!recipe) notFound();

  // steps는 Json 컬럼 — 안전하게 캐스팅
  const steps = Array.isArray(recipe.steps)
    ? (recipe.steps as unknown as RecipeStep[])
    : [];

  // 해시태그 분리 — "#닭갈비#매콤" 또는 "닭갈비, 매콤" 같은 다양한 포맷
  const tags = recipe.hashtags
    ? recipe.hashtags
        .split(/[#,\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const heroImage = recipe.imageBig || recipe.imageMain;

  return (
    <div className="space-y-5 pb-10">
      {/* 상단 — 뒤로 */}
      <div>
        <Link
          href="/recipes"
          className="text-xs text-ink-4 hover:text-ink-2"
        >
          ← 레시피 목록
        </Link>
      </div>

      {/* 메인 이미지 */}
      <div className="bg-surface-muted rounded-2xl overflow-hidden aspect-[4/3] md:aspect-[16/9] relative">
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt={recipe.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-stone-300 text-6xl">
            🍽️
          </div>
        )}
      </div>

      {/* 제목 / 메타 */}
      <header className="space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          {recipe.category && (
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-brand-soft text-brand-700">
              {recipe.category}
            </span>
          )}
          {recipe.cookingMethod && (
            <span className="text-xs text-ink-4">
              {recipe.cookingMethod}
            </span>
          )}
          {recipe.servingWeight && (
            <span className="text-xs text-ink-4">
              · 1인분 {recipe.servingWeight}g
            </span>
          )}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-ink-1">
          {recipe.name}
        </h1>
        {tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap pt-1">
            {tags.map((t, i) => (
              <span
                key={`${t}-${i}`}
                className="text-[11px] text-ink-4 bg-surface-muted rounded-full px-2 py-0.5"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* 영양 정보 strip */}
      <section className="grid grid-cols-5 gap-2 card p-3 md:p-4">
        <NutritionItem label="열량" value={recipe.caloriesKcal} unit="kcal" />
        <NutritionItem label="탄수" value={recipe.carbsG} unit="g" />
        <NutritionItem label="단백" value={recipe.proteinG} unit="g" />
        <NutritionItem label="지방" value={recipe.fatG} unit="g" />
        <NutritionItem label="나트륨" value={recipe.sodiumMg} unit="mg" />
      </section>

      {/* 재료 */}
      {recipe.ingredientsRaw && (
        <section className="card p-4 md:p-5">
          <h2 className="font-bold mb-2 flex items-center gap-2">
            🥘 재료
          </h2>
          <pre className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed font-sans">
            {recipe.ingredientsRaw}
          </pre>
          {recipe.ingredientsList.length > 0 && (
            <div className="mt-3 pt-3 border-t border-line">
              <div className="text-xs text-ink-4 mb-1.5">검색 키워드</div>
              <div className="flex flex-wrap gap-1.5">
                {recipe.ingredientsList.map((ing) => (
                  <Link
                    key={ing}
                    href={`/recipes?q=${encodeURIComponent(ing)}`}
                    className="text-[11px] bg-surface-muted hover:bg-surface-sunken rounded px-2 py-0.5 text-ink-2"
                  >
                    {ing}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 만드는 법 */}
      {steps.length > 0 && (
        <section className="card p-4 md:p-5">
          <h2 className="font-bold mb-3 flex items-center gap-2">
            📝 만드는 법
          </h2>
          <ol className="space-y-4">
            {steps.map((s) => (
              <li key={s.idx} className="flex gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-brand-500 text-white flex items-center justify-center text-xs font-bold">
                  {s.idx}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">
                    {s.text}
                  </p>
                  {s.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.image}
                      alt={`단계 ${s.idx}`}
                      loading="lazy"
                      className="rounded-lg max-w-full md:max-w-md h-auto"
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 저감조리법 TIP */}
      {recipe.tip && (
        <section className="bg-warning-soft border border-warning/30 rounded-xl p-4 md:p-5">
          <h2 className="font-bold mb-2 flex items-center gap-2 text-warning-text">
            💡 저감조리법 TIP
          </h2>
          <p className="text-sm text-warning-text whitespace-pre-wrap leading-relaxed">
            {recipe.tip}
          </p>
        </section>
      )}

      <footer className="text-[11px] text-ink-4 pt-2">
        출처: 식품의약품안전처 식품안전나라 · 조리식품 레시피 DB (COOKRCP01)
      </footer>
    </div>
  );
}

function NutritionItem({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-ink-4">{label}</div>
      <div className="text-sm md:text-base font-bold text-ink-1 mt-0.5">
        {value !== null ? Math.round(value * 10) / 10 : "—"}
      </div>
      <div className="text-[10px] text-ink-4">{unit}</div>
    </div>
  );
}
