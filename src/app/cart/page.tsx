"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";
import CartProductSearch, {
  type SearchableProduct,
} from "@/components/CartProductSearch";
import { useFavorites } from "@/components/FavoritesProvider";
import RecipeRecommendations from "@/components/RecipeRecommendations";

type CartItem = { productId: string; quantity: number };
type CompareLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  available: boolean;
};
type Comparison = {
  storeId: string;
  storeName: string;
  chainName: string;
  total: number;
  availableCount: number;
  totalItems: number;
  complete: boolean;
  lines: CompareLine[];
};

export default function CartPage() {
  const [products, setProducts] = useState<SearchableProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [results, setResults] = useState<Comparison[] | null>(null);
  const [loading, setLoading] = useState(false);

  const { ids: favoriteIds } = useFavorites();
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  // 인기 정렬로 fetch — priceCount 많은 순
  useEffect(() => {
    fetch("/api/products?limit=500&sort=popular")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []));
  }, []);

  // 장바구니 productId 빠른 조회
  const cartIds = useMemo(
    () => new Set(cart.map((c) => c.productId)),
    [cart]
  );

  // 상품 → 메타 lookup
  const productMap = useMemo(() => {
    const m = new Map<string, SearchableProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  function addToCart(productId: string) {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.productId === productId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { productId, quantity: 1 }];
    });
    // 장바구니 변경 → 이전 비교 결과 무효화
    setResults(null);
  }

  function setQuantity(productId: string, q: number) {
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId
          ? { ...c, quantity: Math.max(1, q) }
          : c
      )
    );
    setResults(null);
  }

  function removeItem(productId: string) {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
    setResults(null);
  }

  function clearCart() {
    setCart([]);
    setResults(null);
  }

  async function compare() {
    if (cart.length === 0) return;
    setLoading(true);
    const res = await fetch("/api/cart/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart }),
    });
    const data = await res.json();
    setResults(data.comparisons);
    setLoading(false);
  }

  // 비교 결과 통계
  const filteredResults = useMemo(() => {
    if (!results) return null;
    return favoriteOnly
      ? results.filter((r) => favoriteIds.has(r.storeId))
      : results;
  }, [results, favoriteOnly, favoriteIds]);

  const savings = useMemo(() => {
    if (!results || results.length < 2) return null;
    const completes = results.filter((r) => r.complete);
    if (completes.length < 2) return null;
    const cheapest = completes[0];
    const mostExpensive = completes[completes.length - 1];
    return {
      diff: mostExpensive.total - cheapest.total,
      cheapestName: cheapest.chainName,
    };
  }, [results]);

  // 즐겨찾기 매장 중 최저가
  const favoriteSavings = useMemo(() => {
    if (!results || favoriteIds.size === 0) return null;
    const favComplete = results.filter(
      (r) => favoriteIds.has(r.storeId) && r.complete
    );
    const allComplete = results.filter((r) => r.complete);
    if (favComplete.length === 0 || allComplete.length === 0) return null;
    const favBest = favComplete[0];
    const overallWorst = allComplete[allComplete.length - 1];
    if (overallWorst.total <= favBest.total) return null;
    return {
      diff: overallWorst.total - favBest.total,
      name: favBest.chainName,
    };
  }, [results, favoriteIds]);

  const cartCount = cart.reduce((n, c) => n + c.quantity, 0);

  // 장바구니 상품명 리스트 — 레시피 추천에 전달
  const cartProductNames = useMemo(
    () =>
      cart
        .map((c) => productMap.get(c.productId)?.name)
        .filter((n): n is string => !!n),
    [cart, productMap]
  );

  return (
    <div className="space-y-4 pb-24 md:pb-6">
      <div>
        <h1 className="text-2xl font-bold">장보기 비교</h1>
        <p className="text-stone-600 text-sm mt-1">
          살 물건을 담으면 어느 마트가 가장 싼지 알려드려요.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ── 왼쪽: 검색 + 결과 ── */}
        <section className="bg-white border border-stone-200 rounded-xl p-4 md:p-5">
          <h2 className="font-bold mb-3">상품 찾기</h2>
          <CartProductSearch
            products={products}
            onAdd={addToCart}
            cartIds={cartIds}
          />
        </section>

        {/* ── 오른쪽: 누적 장바구니 ── */}
        <section className="bg-white border border-stone-200 rounded-xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold">
              장바구니{" "}
              {cart.length > 0 && (
                <span className="text-xs text-stone-500 font-normal">
                  ({cart.length}종 · 총 {cartCount}개)
                </span>
              )}
            </h2>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-stone-400 hover:text-rose-500"
              >
                전체 비우기
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <div className="text-sm text-stone-500 text-center py-10 border border-dashed border-stone-300 rounded-lg">
              왼쪽에서 상품을 검색해서 추가하세요
            </div>
          ) : (
            <ul className="space-y-2">
              {cart.map((item) => {
                const p = productMap.get(item.productId);
                return (
                  <li
                    key={item.productId}
                    className="flex items-center gap-2 p-2 border border-stone-200 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {p?.name ?? "(미확인)"}
                      </div>
                      {p?.unit && (
                        <div className="text-[11px] text-stone-500 truncate">
                          {p.unit}
                        </div>
                      )}
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        setQuantity(
                          item.productId,
                          parseInt(e.target.value) || 1
                        )
                      }
                      className="w-14 px-2 py-1.5 border border-stone-300 rounded text-center text-sm shrink-0"
                      aria-label="수량"
                    />
                    <button
                      onClick={() => removeItem(item.productId)}
                      aria-label="삭제"
                      className="w-7 h-7 shrink-0 text-stone-400 hover:text-rose-500"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* 데스크톱에서만 인라인 비교 버튼 */}
          <button
            onClick={compare}
            disabled={loading || cart.length === 0}
            className="hidden md:block mt-4 w-full bg-brand-500 hover:bg-brand-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "계산 중..." : "마트별 비교"}
          </button>
        </section>
      </div>

      {/* ── 장바구니 재료로 만들 수 있는 요리 추천 ── */}
      {cartProductNames.length > 0 && (
        <RecipeRecommendations productNames={cartProductNames} />
      )}

      {/* ── 비교 결과 ── */}
      {filteredResults && filteredResults.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-bold">비교 결과</h2>
            {favoriteIds.size > 0 && (
              <label className="inline-flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={favoriteOnly}
                  onChange={(e) => setFavoriteOnly(e.target.checked)}
                />
                ★ 즐겨찾기 매장만 ({favoriteIds.size})
              </label>
            )}
          </div>

          {/* 절약 하이라이트 */}
          {savings && savings.diff > 0 && (
            <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-3 mb-3 text-sm">
              <span className="font-semibold text-brand-700">
                {savings.cheapestName}
              </span>
              에서 사면 최대{" "}
              <span className="font-bold text-brand-700">
                {formatWon(savings.diff)}
              </span>{" "}
              절약 가능
            </div>
          )}
          {favoriteSavings && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-3 text-sm">
              ★ 즐겨찾기 매장{" "}
              <span className="font-semibold">{favoriteSavings.name}</span>에서{" "}
              <span className="font-bold text-amber-700">
                {formatWon(favoriteSavings.diff)}
              </span>{" "}
              절약 가능
            </div>
          )}

          {filteredResults && filteredResults.length === 0 && results && results.length > 0 && (
            <div className="bg-stone-50 border border-stone-200 rounded-lg px-4 py-6 text-center text-sm text-stone-600">
              {favoriteOnly
                ? "★ 즐겨찾기 매장에는 이 상품들이 등록되지 않았어요"
                : "비교할 매장이 없어요"}
              <br />
              {favoriteOnly && (
                <button
                  onClick={() => setFavoriteOnly(false)}
                  className="text-xs text-brand-600 hover:underline mt-2 inline-block"
                >
                  ★ 즐겨찾기 필터 해제하고 전체 보기
                </button>
              )}
            </div>
          )}

          <div className="space-y-3">
            {(filteredResults ?? []).map((r, i) => (
              <div
                key={r.storeId}
                className={`bg-white border rounded-xl p-4 ${
                  i === 0 && r.complete
                    ? "border-brand-400 bg-brand-50/30"
                    : "border-stone-200"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {i === 0 && r.complete && (
                        <span className="bg-brand-500 text-white text-xs px-2 py-0.5 rounded-full">
                          최저가
                        </span>
                      )}
                      {favoriteIds.has(r.storeId) && (
                        <span className="text-amber-500 text-xs">★</span>
                      )}
                      <span className="font-bold">{r.chainName}</span>
                      <span className="text-xs text-stone-500">
                        {r.storeName}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 mt-1">
                      {r.availableCount}/{r.totalItems}개 품목 보유
                      {!r.complete && " (일부 미보유)"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-stone-500">합계</div>
                    <div className="text-xl font-bold text-stone-900">
                      {formatWon(r.total)}
                    </div>
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="text-xs text-stone-500 cursor-pointer hover:text-stone-700">
                    품목별 가격 보기
                  </summary>
                  <ul className="mt-2 text-xs space-y-1">
                    {r.lines.map((l) => (
                      <li
                        key={l.productId}
                        className="flex justify-between border-t border-stone-100 pt-1"
                      >
                        <span>
                          {l.productName} × {l.quantity}
                        </span>
                        <span className={l.available ? "" : "text-rose-500"}>
                          {l.available
                            ? formatWon(l.lineTotal!)
                            : "취급 안 함"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
        </section>
      )}

      {filteredResults && filteredResults.length === 0 && (
        <div className="text-sm text-stone-500 text-center py-6">
          조건에 맞는 매장이 없습니다.
        </div>
      )}

      {!results && (
        <div className="text-xs text-stone-500 text-center pt-2">
          가격이 부족하다면{" "}
          <Link href="/upload" className="text-brand-600 hover:underline">
            영수증을 올려주세요
          </Link>
          .
        </div>
      )}

      {/* 모바일 하단 고정 비교 버튼 */}
      <div className="md:hidden fixed bottom-16 left-0 right-0 px-4 z-30 pointer-events-none">
        <button
          onClick={compare}
          disabled={loading || cart.length === 0}
          className="pointer-events-auto w-full bg-brand-500 hover:bg-brand-600 text-white py-3 rounded-xl font-bold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? "계산 중..."
            : cart.length === 0
            ? "장바구니가 비어있어요"
            : `마트별 비교 (${cart.length}종)`}
        </button>
      </div>
    </div>
  );
}
