"use client";

import { useMemo, useState } from "react";
import { formatWon } from "@/lib/format";

export type SearchableProduct = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string;
  unit?: string;
  priceCount?: number;
  stats?: { min: number; max: number; avg: number; count: number };
  hasHaccp?: boolean;
};

type Props = {
  products: SearchableProduct[];
  onAdd: (productId: string) => void;
  /** 이미 장바구니에 담긴 productId 집합 — 표시용 */
  cartIds?: Set<string>;
};

// 정규화: 한글 띄어쓰기 무시 + 소문자
function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[^가-힣a-z0-9]/g, "");
}

// 검색하면서 + 버튼으로 즉시 담는 풍부한 카드 UI
export default function CartProductSearch({ products, onAdd, cartIds }: Props) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // 카테고리 칩 — 카탈로그에 존재하는 것들만
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category) set.add(p.category);
    return Array.from(set).slice(0, 12);
  }, [products]);

  // 인기 상품 — priceCount 많은 순서로 상위 6개
  const popular = useMemo(() => {
    const list = [...products].sort(
      (a, b) => (b.priceCount ?? 0) - (a.priceCount ?? 0)
    );
    return list.slice(0, 6);
  }, [products]);

  const q = norm(query);

  // 검색 결과 — 최대 8개
  const results = useMemo(() => {
    let list = products;
    if (activeCategory) {
      list = list.filter((p) => p.category === activeCategory);
    }
    if (q.length > 0) {
      list = list.filter((p) => {
        const hay = norm(`${p.name} ${p.brand ?? ""} ${p.category ?? ""}`);
        return hay.includes(q);
      });
    }
    return list.slice(0, 8);
  }, [products, q, activeCategory]);

  const showingPopular = q.length === 0 && !activeCategory;

  return (
    <div className="space-y-3">
      {/* 큰 검색 입력 */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상품 검색해서 장바구니에 담기"
          className="w-full px-4 py-3 text-base border-2 border-stone-300 rounded-xl focus:outline-none focus:border-brand-400 placeholder:text-stone-400"
          aria-label="상품 검색"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="검색어 지우기"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-sm"
          >
            ✕
          </button>
        )}
      </div>

      {/* 카테고리 칩 */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1 rounded-full text-xs border ${
              !activeCategory
                ? "bg-brand-500 text-white border-brand-500"
                : "bg-white text-stone-600 border-stone-300 hover:border-stone-400"
            }`}
          >
            전체
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() =>
                setActiveCategory(activeCategory === c ? null : c)
              }
              className={`px-3 py-1 rounded-full text-xs border ${
                activeCategory === c
                  ? "bg-brand-500 text-white border-brand-500"
                  : "bg-white text-stone-600 border-stone-300 hover:border-stone-400"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* 결과 또는 인기 상품 */}
      <div>
        {showingPopular && popular.length > 0 && (
          <div className="text-xs text-stone-500 mb-2">인기 상품</div>
        )}
        {!showingPopular && results.length === 0 && (
          <div className="text-sm text-stone-500 text-center py-6 border border-dashed border-stone-300 rounded-lg">
            "{query || activeCategory}"에 맞는 상품이 없습니다
          </div>
        )}
        <ul className="space-y-2">
          {(showingPopular ? popular : results).map((p) => {
            const inCart = cartIds?.has(p.id);
            const minPrice = p.stats?.min ?? 0;
            return (
              <li
                key={p.id}
                className={`flex items-center gap-3 p-3 border rounded-lg bg-white transition ${
                  inCart
                    ? "border-emerald-300 bg-emerald-50/40"
                    : "border-stone-200 hover:border-brand-300"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate flex items-center gap-1.5">
                    <span className="truncate">{p.name}</span>
                    {p.hasHaccp && (
                      <span className="inline-flex items-center rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium shrink-0">
                        🏅 HACCP
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-stone-500 truncate">
                    {p.category}
                    {p.brand ? ` · ${p.brand}` : ""}
                    {p.unit ? ` · ${p.unit}` : ""}
                  </div>
                  {minPrice > 0 && (
                    <div className="text-[11px] text-stone-700 mt-0.5">
                      최저 <span className="font-semibold">{formatWon(minPrice)}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onAdd(p.id)}
                  aria-label={`${p.name} 장바구니에 담기`}
                  className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold transition ${
                    inCart
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      : "bg-brand-500 text-white hover:bg-brand-600"
                  }`}
                >
                  +
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
