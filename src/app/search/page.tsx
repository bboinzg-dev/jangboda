"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";
import { unitPriceLabel, unitPriceValue } from "@/lib/units";

export const dynamic = "force-dynamic";

type SortBy = "min" | "unit";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  unit: string;
  stats?: { min: number; max: number; avg: number; count: number };
};

const ALL = "__all__";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("min");
  const [category, setCategory] = useState<string>(ALL);
  // 카테고리 칩 후보 — 가능한 모든 카테고리(현재 선택과 무관하게 한번 로드해서 유지)
  const [allCategories, setAllCategories] = useState<string[]>([]);

  async function run(query: string, cat: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (cat && cat !== ALL) params.set("category", cat);
    const res = await fetch(`/api/products?${params.toString()}`);
    const data = await res.json();
    setProducts(data.products);
    // 카테고리 후보 수집 — 카테고리 필터가 안 걸린 결과로만 채움
    if (cat === ALL) {
      const cats = Array.from(
        new Set((data.products as Product[]).map((p) => p.category).filter(Boolean))
      );
      setAllCategories(cats);
    }
    setLoading(false);
  }

  useEffect(() => {
    run("", ALL);
  }, []);

  // 카테고리 변경 시 즉시 재조회
  useEffect(() => {
    run(q, category);
    // q 변경 시는 form submit이 호출하므로 의존성에 q 안 넣음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      if (sortBy === "unit") {
        const ua = a.stats ? unitPriceValue(a.stats.min, a.unit) : null;
        const ub = b.stats ? unitPriceValue(b.stats.min, b.unit) : null;
        if (ua === null && ub === null) return 0;
        if (ua === null) return 1;
        if (ub === null) return -1;
        return ua - ub;
      }
      return (a.stats?.min ?? Infinity) - (b.stats?.min ?? Infinity);
    });
  }, [products, sortBy]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">상품 검색</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q, category);
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="예: 신라면, 우유, 햇반"
          className="flex-1 px-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:border-brand-500"
        />
        <button
          type="submit"
          className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded-lg"
        >
          검색
        </button>
      </form>

      {/* 카테고리 칩 */}
      {allCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <CategoryChip
            label="전체"
            active={category === ALL}
            onClick={() => setCategory(ALL)}
          />
          {allCategories.map((c) => (
            <CategoryChip
              key={c}
              label={c}
              active={category === c}
              onClick={() => setCategory(c)}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs">
        <span className="text-stone-500">정렬:</span>
        <button
          onClick={() => setSortBy("min")}
          className={`px-2 py-1 rounded ${sortBy === "min" ? "bg-brand-100 text-brand-700 font-medium" : "text-stone-600 hover:bg-stone-100"}`}
        >
          최저가
        </button>
        <button
          onClick={() => setSortBy("unit")}
          className={`px-2 py-1 rounded ${sortBy === "unit" ? "bg-brand-100 text-brand-700 font-medium" : "text-stone-600 hover:bg-stone-100"}`}
        >
          단가 (원/100g · 원/1L)
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-stone-500">검색 중...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-8 text-stone-500">
          {q || category !== ALL
            ? "조건에 맞는 상품이 없습니다."
            : "등록된 상품이 없습니다."}
          <br />
          <Link href="/upload" className="text-brand-600 hover:underline mt-2 inline-block">
            영수증을 올려 첫 상품을 추가해보세요 →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sorted.map((p) => {
            const upl = p.stats ? unitPriceLabel(p.stats.min, p.unit) : null;
            return (
              <Link
                key={p.id}
                href={`/products/${p.id}`}
                className="card-clickable bg-white border border-stone-200 hover:border-brand-300 active:bg-stone-50 rounded-lg p-4 flex justify-between"
              >
                <div className="min-w-0">
                  <div className="text-xs text-stone-500">
                    {p.category} · {p.brand}
                  </div>
                  <div className="font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-stone-500">{p.unit}</div>
                </div>
                <div className="text-right ml-4 shrink-0">
                  {p.stats && p.stats.count > 0 ? (
                    <>
                      <div className="text-xs text-stone-500">최저가</div>
                      <div className="font-bold text-brand-600">
                        {formatWon(p.stats.min)}
                      </div>
                      {upl && (
                        <div className="text-[11px] text-stone-500">{upl}</div>
                      )}
                      <div className="text-xs text-stone-500">
                        {p.stats.count}개 매장
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-stone-400">가격 정보 없음</div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-brand-500 text-white border-brand-500"
          : "bg-white text-stone-700 border-stone-200 hover:border-brand-300"
      }`}
    >
      {label}
    </button>
  );
}
