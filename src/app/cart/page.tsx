"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";
import { haversineKm } from "@/lib/distance";
import CartProductSearch, {
  type SearchableProduct,
} from "@/components/CartProductSearch";
import { useFavorites } from "@/components/FavoritesProvider";
import RecipeRecommendations from "@/components/RecipeRecommendations";
import ShoppingMode, { type ShoppingItem } from "@/components/ShoppingMode";
import CollapsibleList from "@/components/CollapsibleList";
import ChainLogo from "@/components/ChainLogo";

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
  chainCategory?: string;
  chainLogoUrl?: string | null;
  address?: string;
  lat?: number;
  lng?: number;
  total: number;
  availableCount: number;
  totalItems: number;
  complete: boolean;
  lines: CompareLine[];
};

// 거리 필터 칩 옵션 (km, null = 전체)
type DistanceFilter = 3 | 5 | 10 | null;
const DISTANCE_OPTIONS: { value: DistanceFilter; label: string }[] = [
  { value: 3, label: "3km" },
  { value: 5, label: "5km" },
  { value: 10, label: "10km" },
  { value: null, label: "전체" },
];

// 위치 권한 상태
type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lat: number; lng: number }
  | { status: "denied" }
  | { status: "error" };

// 온라인 매장 판별: lat=0,lng=0이거나 chain.category === "online"
function isOnlineStore(c: Comparison): boolean {
  if (c.lat === 0 && c.lng === 0) return true;
  if (c.chainCategory === "online") return true;
  return false;
}

export default function CartPage() {
  const [products, setProducts] = useState<SearchableProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [results, setResults] = useState<Comparison[] | null>(null);
  const [loading, setLoading] = useState(false);

  const { ids: favoriteIds } = useFavorites();
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  // 위치 + 거리 필터 상태
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>(null);

  // 복사/공유 토스트 (메시지 포함)
  const [copied, setCopied] = useState<null | "shared" | "copied">(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 장보기 모드 (풀스크린 체크리스트)
  const [shoppingOpen, setShoppingOpen] = useState(false);

  // 인기 정렬로 fetch — priceCount 많은 순
  useEffect(() => {
    fetch("/api/products?limit=500&sort=popular")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []));
  }, []);

  // 첫 진입 시 자동 위치 요청 (사용자가 매번 버튼 눌러야 하는 거 회피)
  // 거부/실패 시 전체 비교 모드로 폴백
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setDistanceFilter(5); // 위치 확보 시 기본 5km
      },
      (err) => {
        setGeo({
          status: err.code === err.PERMISSION_DENIED ? "denied" : "error",
        });
      },
      { timeout: 6000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
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

  // 위치 요청 — 사용자 인터랙션(비교 버튼 또는 "내 위치 사용" 버튼)에서 호출
  function requestGeolocation() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGeo({ status: "error" });
      setDistanceFilter(null);
      return;
    }
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        // 위치 확보 시 기본값 5km
        setDistanceFilter((prev) => (prev === null && geo.status !== "ready" ? 5 : prev));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setGeo({ status: "denied" });
        } else {
          setGeo({ status: "error" });
        }
        setDistanceFilter(null);
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  }

  async function compare() {
    if (cart.length === 0) return;
    setLoading(true);
    // 위치는 사용자가 명시적으로 "내 위치 사용" 버튼을 눌러야만 요청 (자동 트리거 X)
    const res = await fetch("/api/cart/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart }),
    });
    const data = await res.json();
    setResults(data.comparisons);
    setLoading(false);
  }

  // 위치 ready 직후 기본 5km 설정
  useEffect(() => {
    if (geo.status === "ready" && distanceFilter === null) {
      setDistanceFilter(5);
    }
  }, [geo.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // 즐겨찾기 필터 적용된 결과
  const filteredResults = useMemo(() => {
    if (!results) return null;
    return favoriteOnly
      ? results.filter((r) => favoriteIds.has(r.storeId))
      : results;
  }, [results, favoriteOnly, favoriteIds]);

  // 온라인/오프라인 분리 + 거리 필터
  const offlineResults = useMemo(() => {
    if (!filteredResults) return [];
    const offline = filteredResults.filter((r) => !isOnlineStore(r));
    let withDist = offline.map((r) => {
      const dist =
        geo.status === "ready" && r.lat != null && r.lng != null
          ? haversineKm(geo.lat, geo.lng, r.lat, r.lng)
          : null;
      return { ...r, _distanceKm: dist };
    });
    // 거리 필터 적용 (위치 있고, 칩이 km 값일 때만)
    if (geo.status === "ready" && distanceFilter !== null) {
      withDist = withDist.filter(
        (r) => r._distanceKm !== null && r._distanceKm <= distanceFilter
      );
    }
    // 합계 오름차순
    withDist.sort((a, b) => a.total - b.total);
    return withDist;
  }, [filteredResults, geo, distanceFilter]);

  const onlineResults = useMemo(() => {
    if (!filteredResults) return [];
    const online = filteredResults.filter(isOnlineStore);
    return [...online].sort((a, b) => a.total - b.total);
  }, [filteredResults]);

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

  // 장보기 모드용 데이터 — productMap에서 메타 합쳐서 전달
  const shoppingItems = useMemo<ShoppingItem[]>(
    () =>
      cart.map((c) => {
        const p = productMap.get(c.productId);
        return {
          productId: c.productId,
          name: p?.name ?? "상품",
          brand: p?.brand ?? null,
          unit: p?.unit ?? null,
          quantity: c.quantity,
        };
      }),
    [cart, productMap]
  );

  // 장보기 리스트 텍스트 생성
  function buildShoppingListText(): string {
    const lines: string[] = [];
    lines.push(`🛒 장보기 리스트 (${cart.length}개 · 총 ${cartCount}개)`);
    lines.push("");
    for (const item of cart) {
      const name = productMap.get(item.productId)?.name ?? "(미확인)";
      lines.push(`☐ ${name} × ${item.quantity}`);
    }
    // 비교 결과 있으면 최저가 매장 한 줄
    if (results && results.length > 0) {
      const completes = results.filter((r) => r.complete);
      const best = completes.length > 0 ? completes[0] : results[0];
      if (best) {
        lines.push("");
        lines.push(
          `─ 가장 저렴한 매장: ${best.chainName} ${best.storeName} (${formatWon(
            best.total
          )})`
        );
      }
    }
    return lines.join("\n");
  }

  async function shareShoppingList() {
    if (cart.length === 0) return;
    const text = buildShoppingListText();
    const title = "🛒 장보기 리스트";

    // 1) navigator.share 시도 — 모바일 브라우저(iOS Safari, Android Chrome)에서 네이티브 공유 시트 띄움
    try {
      if (
        typeof navigator !== "undefined" &&
        typeof (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share === "function"
      ) {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
          title,
          text,
        });
        setCopied("shared");
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(null), 2000);
        return;
      }
    } catch (e) {
      // 사용자가 공유 시트 취소 → 토스트 띄우지 않고 종료
      if (e instanceof Error && e.name === "AbortError") return;
      // 그 외 실패는 클립보드 복사로 폴백
    }

    // 2) navigator.clipboard.writeText 폴백
    let ok = false;
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }

    // 3) 마지막 폴백: 숨겨진 textarea + execCommand
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied("copied");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(null), 2000);
    }
  }

  // 거리 필터를 보여줄지 — 카트가 비어있지 않고, 결과가 있을 때만 의미 있음
  const showDistanceFilter = cart.length > 0 && results !== null;

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
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="font-bold">
              장바구니{" "}
              {cart.length > 0 && (
                <span className="text-xs text-stone-500 font-normal">
                  ({cart.length}종 · 총 {cartCount}개)
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  onClick={() => setShoppingOpen(true)}
                  className="text-xs px-2.5 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded font-semibold"
                  title="마트에서 보면서 체크할 수 있는 큰 화면"
                >
                  🛒 장보기 시작
                </button>
              )}
              {cart.length > 0 && (
                <button
                  onClick={shareShoppingList}
                  className="text-xs px-2 py-1 border border-stone-300 rounded hover:bg-stone-50 text-stone-700"
                  title="장보기 리스트를 가족·친구에게 공유"
                >
                  {copied === "shared"
                    ? "✓ 보냈어요!"
                    : copied === "copied"
                    ? "✓ 복사됨!"
                    : "📤 친구한테 보내기"}
                </button>
              )}
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-stone-400 hover:text-rose-500"
                >
                  비우기
                </button>
              )}
            </div>
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

          {/* 거리 필터 — 위치 권한 상태별 분기 */}
          {showDistanceFilter && (
            <>
              {/* 권한 받기 전: 안내 카드 + 단일 버튼 (60대 사용자도 명확) */}
              {(geo.status === "idle" || geo.status === "loading") && (
                <div className="mb-3 flex items-center gap-3 flex-wrap bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5">
                  <span className="text-sm text-stone-700 flex-1 min-w-[200px]">
                    📍 가까운 마트만 보고 싶다면 오른쪽 버튼을 눌러주세요
                  </span>
                  <button
                    onClick={requestGeolocation}
                    disabled={geo.status === "loading"}
                    className="text-sm px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white rounded-lg font-semibold shrink-0"
                  >
                    {geo.status === "loading" ? "위치 확인 중..." : "내 위치 사용"}
                  </button>
                </div>
              )}

              {/* 권한 받은 후: 거리 칩 노출 */}
              {geo.status === "ready" && (
                <div className="mb-3 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-stone-500">📍 거리</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {DISTANCE_OPTIONS.map((opt) => {
                      const active = distanceFilter === opt.value;
                      return (
                        <button
                          key={opt.label}
                          onClick={() => setDistanceFilter(opt.value)}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                            active
                              ? "bg-brand-500 border-brand-500 text-white"
                              : "bg-white border-stone-300 text-stone-700 hover:bg-stone-50"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 권한 거부/오류: 안내 메시지만 */}
              {(geo.status === "denied" || geo.status === "error") && (
                <div className="mb-3 text-xs text-stone-500 bg-stone-50 border border-stone-200 rounded-lg px-3 py-2">
                  {geo.status === "denied"
                    ? "위치 권한이 없어 거리 필터를 사용할 수 없습니다"
                    : "위치를 가져올 수 없어 거리 필터를 사용할 수 없습니다"}
                </div>
              )}
            </>
          )}

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

          {/* 오프라인 매장 섹션 */}
          <div className="mb-5">
            <h3 className="font-bold text-sm mb-2 text-stone-700">
              🏪 오프라인 매장 ({offlineResults.length}개)
            </h3>
            {offlineResults.length === 0 ? (
              <div className="bg-stone-50 border border-stone-200 rounded-lg px-4 py-5 text-center text-sm text-stone-600">
                {geo.status === "ready" && distanceFilter !== null ? (
                  <>
                    🚶 {distanceFilter}km 이내 매장에는 등록되지 않았습니다.{" "}
                    거리를 더 넓혀 보세요.
                    <br />
                    <button
                      onClick={() => setDistanceFilter(null)}
                      className="text-xs text-brand-600 hover:underline mt-2 inline-block"
                    >
                      [전체] 보기
                    </button>
                  </>
                ) : (
                  <>오프라인 매장 결과가 없어요</>
                )}
              </div>
            ) : (
              <CollapsibleList initialCount={5} innerClassName="space-y-3">
                {offlineResults.map((r, i) => (
                  <ComparisonCard
                    key={r.storeId}
                    r={r}
                    isCheapest={i === 0 && r.complete}
                    isFavorite={favoriteIds.has(r.storeId)}
                    distanceKm={r._distanceKm}
                  />
                ))}
              </CollapsibleList>
            )}
          </div>

          {/* 온라인 매장 섹션 */}
          <div>
            <h3 className="font-bold text-sm mb-2 text-stone-700">
              🛒 온라인 매장 ({onlineResults.length}개)
            </h3>
            {onlineResults.length === 0 ? (
              <div className="bg-stone-50 border border-stone-200 rounded-lg px-4 py-5 text-center text-sm text-stone-600">
                온라인 매장 결과가 없어요
              </div>
            ) : (
              <CollapsibleList initialCount={5} innerClassName="space-y-3">
                {onlineResults.map((r, i) => (
                  <ComparisonCard
                    key={r.storeId}
                    r={r}
                    isCheapest={i === 0 && r.complete}
                    isFavorite={favoriteIds.has(r.storeId)}
                    distanceKm={null}
                  />
                ))}
              </CollapsibleList>
            )}
          </div>

          {/* 큰 "장보기 시작" CTA — 비교 끝났으니 바로 마트로 갈 수 있게 */}
          {cart.length > 0 && (
            <div className="mt-5">
              <button
                onClick={() => setShoppingOpen(true)}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white py-3.5 rounded-xl text-base font-bold shadow-sm"
              >
                🛒 장보기 시작 — 큰 글씨로 체크하기
              </button>
              <p className="text-xs text-stone-500 text-center mt-1.5">
                마트에서 보면서 한 줄씩 체크할 수 있어요
              </p>
            </div>
          )}
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

      {shoppingOpen && cart.length > 0 && (
        <ShoppingMode
          items={shoppingItems}
          onClose={() => setShoppingOpen(false)}
        />
      )}
    </div>
  );
}

// 매장 카드 — 오프라인/온라인 양쪽에서 동일하게 사용
function ComparisonCard({
  r,
  isCheapest,
  isFavorite,
  distanceKm,
}: {
  r: Comparison;
  isCheapest: boolean;
  isFavorite: boolean;
  distanceKm: number | null;
}) {
  return (
    <div
      className={`bg-white border rounded-xl p-4 ${
        isCheapest ? "border-brand-400 bg-brand-50/30" : "border-stone-200"
      }`}
    >
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {isCheapest && (
              <span className="bg-brand-500 text-white text-xs px-2 py-0.5 rounded-full">
                최저가
              </span>
            )}
            {isFavorite && <span className="text-amber-500 text-xs">★</span>}
            <ChainLogo src={r.chainLogoUrl} name={r.chainName} size={24} />
            <span className="font-bold">{r.chainName}</span>
            <span className="text-xs text-stone-500">{r.storeName}</span>
            {distanceKm !== null && (
              <span className="text-[11px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                {distanceKm < 10
                  ? distanceKm.toFixed(1)
                  : distanceKm.toFixed(0)}
                km
              </span>
            )}
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
                {l.available ? formatWon(l.lineTotal!) : "취급 안 함"}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
