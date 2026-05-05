"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";
import { unitPriceParts, unitPriceValue } from "@/lib/units";
import EmptyState from "@/components/EmptyState";
import ProductImage from "@/components/ProductImage";
import { IconSearch } from "@/components/icons";

// search는 client에서 /api/products로 fetch — 페이지 자체는 정적
export const dynamic = "force-static";

type SortBy = "min" | "unit";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  unit: string;
  imageUrl?: string | null;
  stats?: { min: number; max: number; avg: number; count: number };
  chains?: { name: string; logoUrl: string | null; count: number }[];
  hasHaccp?: boolean;
};

const ALL = "__all__";
// 한 페이지에 보여줄 상품 개수
const PAGE_SIZE = 30;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  // 디폴트는 단가순 — 같은 용량으로 환산해서 비교하는 게 사용자에게 더 의미 있음
  // (대용량 박스/소포장이 섞여도 공정 비교)
  const [sortBy, setSortBy] = useState<SortBy>("unit");
  const [category, setCategory] = useState<string>(ALL);
  // 카테고리 칩 후보 — 가능한 모든 카테고리(현재 선택과 무관하게 한번 로드해서 유지)
  const [allCategories, setAllCategories] = useState<string[]>([]);
  // 페이지네이션 — 클라이언트 측에서 sliced 표시
  const [page, setPage] = useState(1);

  async function run(query: string, cat: string) {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (cat && cat !== ALL) params.set("category", cat);
    // 카탈로그 전체를 한 번에 받아 클라이언트에서 페이지네이션 (parsa 미러 600+ 대응)
    params.set("limit", "1000");
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

  // 입력 중 자동 검색 (300ms debounce) — enter/검색 버튼 안 눌러도 결과 즉시 반영
  // 사용자가 "물회" 타이핑하면 300ms 후 자동으로 fetch
  useEffect(() => {
    const handle = setTimeout(() => {
      run(q, category);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category]);

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

  // 검색어/카테고리/정렬 변경 시 1페이지로 리셋
  useEffect(() => {
    setPage(1);
  }, [q, category, sortBy]);

  // 결과 변동 시에도 안전하게 1페이지로
  useEffect(() => {
    setPage(1);
  }, [products]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // page가 totalPages를 벗어났을 때 보호
  const currentPage = Math.min(page, totalPages);
  const visible = sorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink-1 tracking-tight">상품 검색</h1>

      {/* sticky 헤더 — 검색 입력 + 카테고리 칩 */}
      <div className="sticky top-0 z-10 bg-page/95 backdrop-blur-sm pb-2 -mx-4 px-4 space-y-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(q, category);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <IconSearch
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="예: 신라면, 우유, 햇반"
              className="w-full pl-9 pr-4 py-2 border border-line-strong rounded-xl focus:outline-none focus:border-brand-500"
            />
          </div>
          <button
            type="submit"
            className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded-xl"
          >
            검색
          </button>
        </form>

        {/* 카테고리 칩 — 모바일은 가로 스크롤, 데스크톱은 자유 줄바꿈 */}
        {allCategories.length > 0 && (
          <div className="relative">
            <div className="flex md:flex-wrap flex-nowrap gap-2 overflow-x-auto md:overflow-visible -mx-4 px-4 md:mx-0 md:px-0 pb-1 scrollbar-thin">
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
            {/* 모바일에서 오른쪽 끝 페이드 — 더 있다는 시각 힌트 */}
            <div className="md:hidden pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-page to-transparent" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-ink-3">정렬:</span>
        <button
          onClick={() => setSortBy("min")}
          className={`px-2 py-1 rounded ${sortBy === "min" ? "bg-brand-100 text-brand-700 font-medium" : "text-ink-2 hover:bg-surface-muted"}`}
        >
          최저가
        </button>
        <button
          onClick={() => setSortBy("unit")}
          title="같은 용량으로 환산했을 때 더 싼 상품이 위로 (예: 100g당 가격, 1L당 가격)"
          className={`px-2 py-1 rounded inline-flex items-center gap-1 ${sortBy === "unit" ? "bg-brand-100 text-brand-700 font-medium" : "text-ink-2 hover:bg-surface-muted"}`}
        >
          단가순
          <span
            aria-hidden
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-current text-[9px] font-semibold leading-none"
          >
            i
          </span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-ink-3">검색 중...</div>
      ) : products.length === 0 ? (
        q ? (
          // 검색어가 있는데 결과 0건
          <EmptyState
            illustration="/illustrations/empty-search.png"
            icon="🔍"
            title={`"${q}" 검색 결과가 없어요`}
            description={
              category !== ALL ? (
                <>
                  카테고리 필터를 풀거나 다른 키워드로 검색해보세요.
                  <br />
                  새 영수증을 올리면 카탈로그가 늘어납니다.
                </>
              ) : (
                <>
                  다른 키워드로 검색해보세요.
                  <br />
                  영수증을 올리면 카탈로그가 자동으로 늘어납니다.
                </>
              )
            }
            actions={[
              { href: "/upload", label: "📸 영수증 올리기", primary: true },
              { href: "/search", label: "전체 카테고리 보기" },
            ]}
          >
            {category !== ALL && (
              <div className="mb-4">
                <button
                  onClick={() => setCategory(ALL)}
                  className="text-xs text-brand-600 hover:underline"
                >
                  ← 다른 카테고리 보기 (필터 해제)
                </button>
              </div>
            )}
          </EmptyState>
        ) : category !== ALL ? (
          // 검색어 없이 카테고리만 — 빈 카테고리
          <EmptyState
            illustration="/illustrations/empty-search.png"
            icon="📂"
            title={`"${category}" 카테고리에 등록된 상품이 없어요`}
            description="다른 카테고리를 보거나, 영수증을 올려 직접 카탈로그를 채워보세요."
            actions={[
              { href: "/upload", label: "📸 영수증 올리기", primary: true },
            ]}
          >
            <div className="mb-4">
              <button
                onClick={() => setCategory(ALL)}
                className="text-xs text-brand-600 hover:underline"
              >
                ← 다른 카테고리 보기
              </button>
            </div>
          </EmptyState>
        ) : (
          // 초기/완전 빈 상태
          <EmptyState
            illustration="/illustrations/empty-cart.png"
            icon="🛒"
            title="아직 등록된 상품이 없어요"
            description="첫 영수증을 올리면 카탈로그가 자동으로 만들어지고, 다른 사용자도 함께 절약합니다."
            actions={[
              { href: "/upload", label: "📸 영수증 올리기", primary: true },
              { href: "/cart", label: "장바구니 시작" },
            ]}
          />
        )
      ) : (
        <>
          {/* 결과 카운트 + 페이지 표시 */}
          <div className="text-xs text-ink-3">
            총 {sorted.length}개 상품 · 페이지 {currentPage}/{totalPages}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visible.map((p) => {
              const uparts = p.stats ? unitPriceParts(p.stats.min, p.unit) : null;
              return (
                <Link
                  key={p.id}
                  href={`/products/${p.id}`}
                  className="card-clickable relative bg-white border border-line rounded-xl p-4 pr-7 flex gap-3 items-start"
                >
                  <ProductImage
                    src={p.imageUrl}
                    alt={p.name}
                    size={64}
                    className="shrink-0 rounded-md overflow-hidden bg-surface-muted"
                  />
                  <div className="min-w-0 flex-1 flex justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-ink-3">
                        {p.category}
                        {p.brand ? ` · ${p.brand}` : ""}
                      </div>
                      {/* 긴 상품명 2줄까지 노출 — 핵심 정보 손실 방지 */}
                      <div className="font-semibold text-ink-1 leading-snug line-clamp-2">
                        {p.name}
                        {p.hasHaccp && (
                          <span className="inline-flex items-center rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium shrink-0 ml-1 align-middle">
                            🏅 HACCP
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-3 mt-0.5">{p.unit}</div>
                      {/* 등록 chain 분포 — 같은 SKU인지 다른 SKU인지 사용자가 매장 분포로 판단 */}
                      {p.chains && p.chains.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.chains.map((c) => (
                            <span
                              key={c.name}
                              className="inline-flex items-center text-[10px] bg-stone-100 text-stone-700 rounded px-1.5 py-0.5"
                              title={`${c.name} ${c.count}매장`}
                            >
                              {c.name}
                              {c.count > 1 && (
                                <span className="ml-0.5 text-stone-500">·{c.count}</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {p.stats && p.stats.count > 0 ? (
                        <>
                          {/* 실판매가가 메인 — 사용자가 실제로 지불할 금액. 단가는 보조 비교용 */}
                          <div className="text-[10px] text-ink-3 font-medium">
                            최저가
                          </div>
                          <div className="text-2xl font-extrabold tabular-nums tracking-tight text-brand-600">
                            {formatWon(p.stats.min)}
                          </div>
                          {uparts && (
                            <div className="text-[11px] text-ink-3 tabular-nums font-mono mt-0.5">
                              {uparts.basis} {uparts.amount}
                            </div>
                          )}
                          <div className="text-[10px] text-ink-3 mt-0.5">
                            {p.stats.count}개 매장
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-ink-3">가격 정보 없음</div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* 페이지네이션 — prev/next + 현재/전체 표시 */}
          {totalPages > 1 && (
            <nav
              aria-label="검색 결과 페이지"
              className="flex items-center justify-center gap-3 pt-2"
            >
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 rounded-md border border-line-strong bg-white text-sm text-ink-2 hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← 이전
              </button>
              <div className="text-sm text-ink-2 tabular-nums">
                {currentPage} / {totalPages}
              </div>
              <button
                type="button"
                onClick={() =>
                  setPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="px-4 py-2 rounded-md border border-line-strong bg-white text-sm text-ink-2 hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                다음 →
              </button>
            </nav>
          )}
        </>
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
      className={`shrink-0 whitespace-nowrap text-[11px] md:text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-ink-1 text-white border-ink-1"
          : "bg-white text-ink-2 border-line hover:border-line-strong"
      }`}
    >
      {label}
    </button>
  );
}
