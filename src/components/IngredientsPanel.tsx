"use client";

import { useEffect, useState } from "react";

// 22대 식품 알레르기 의무표시 키워드 — 원재료명에 포함되면 배지로 강조.
const ALLERGEN_KEYWORDS = [
  "우유",
  "계란",
  "대두",
  "밀",
  "땅콩",
  "호두",
  "아몬드",
  "새우",
  "게",
  "고등어",
  "메밀",
  "돼지고기",
  "쇠고기",
  "닭고기",
  "조개",
  "오징어",
  "복숭아",
  "토마토",
  "아황산",
  "잣",
];

type IngredientRow = {
  rawMaterialName: string;
  order: number;
  productName: string;
  manufacturer: string;
  reportNo: string;
  productType: string | null;
};

type IngredientLookupResult = {
  found: boolean;
  productName: string | null;
  manufacturer: string | null;
  reportNo: string | null;
  productType: string | null;
  ingredients: IngredientRow[];
  raw: string;
  source: "foodsafety_c002" | "mock" | "none";
};

function detectAllergens(raw: string): string[] {
  const found = new Set<string>();
  for (const k of ALLERGEN_KEYWORDS) {
    if (raw.includes(k)) found.add(k);
  }
  return [...found];
}

export default function IngredientsPanel({ productId }: { productId: string }) {
  const [data, setData] = useState<IngredientLookupResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/products/${productId}/ingredients`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: IngredientLookupResult | null) => {
        if (!cancelled) {
          setData(j);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <section className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="h-5 w-28 bg-stone-100 rounded animate-pulse mb-3" />
        <div className="text-xs text-stone-400">
          원재료 정보 불러오는 중...
        </div>
      </section>
    );
  }

  if (!data || !data.found || data.ingredients.length === 0) {
    return (
      <section className="bg-white border border-stone-200 rounded-xl p-4">
        <h2 className="font-bold text-sm mb-1 text-stone-600">
          🧪 원재료 정보
        </h2>
        <div className="text-xs text-stone-400">
          원재료 정보를 찾지 못했습니다
        </div>
      </section>
    );
  }

  const allergens = detectAllergens(data.raw);
  const sourceLabel =
    data.source === "mock"
      ? "샘플 데이터 (개발용)"
      : `식품의약품안전처 (${data.manufacturer ?? ""}${
          data.manufacturer && data.productName ? "의 " : ""
        }${data.productName ?? ""})`;

  return (
    <section className="bg-white border border-stone-200 rounded-xl p-4">
      <h2 className="font-bold text-sm mb-1 flex items-center gap-2">
        🧪 원재료 정보
        {data.productType && (
          <span className="text-[10px] font-normal text-stone-500 bg-stone-100 rounded px-1.5 py-0.5">
            {data.productType}
          </span>
        )}
      </h2>
      <div className="text-[11px] text-stone-500 mb-2">
        출처: {sourceLabel}
      </div>

      <div className="text-sm text-stone-700 leading-relaxed">{data.raw}</div>

      {allergens.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {allergens.map((a) => (
            <span
              key={a}
              className="text-[11px] bg-orange-100 text-orange-700 border border-orange-200 rounded-full px-2 py-0.5"
            >
              알레르기: {a}
            </span>
          ))}
        </div>
      )}

      <details className="mt-3 group">
        <summary className="text-xs text-stone-500 cursor-pointer hover:text-stone-700 select-none">
          전체 {data.ingredients.length}개 원재료 보기
        </summary>
        <ol className="mt-2 list-decimal list-inside text-xs text-stone-600 space-y-0.5 pl-1">
          {data.ingredients.map((ing, idx) => (
            <li key={`${ing.order}-${idx}`}>{ing.rawMaterialName}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}
