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
import {
  Button,
  Badge,
  Card,
  Caption,
  Num,
  Progress,
  CartIcon,
  PinIcon,
  StoreIcon,
  FilterIcon,
  FlameIcon,
  CloseIcon,
  ChevronIcon,
} from "@/components/ui";

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

type DistanceFilter = 3 | 5 | 10 | null;
const DISTANCE_OPTIONS: { value: DistanceFilter; label: string }[] = [
  { value: 3, label: "3km" },
  { value: 5, label: "5km" },
  { value: 10, label: "10km" },
  { value: null, label: "전체" },
];

type GeoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; lat: number; lng: number }
  | { status: "denied" }
  | { status: "error" };

function isOnlineStore(c: Comparison): boolean {
  if (c.lat === 0 && c.lng === 0) return true;
  if (c.chainCategory === "online") return true;
  return false;
}

export default function CartPage() {
  const [products, setProducts] = useState<SearchableProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [results, setResults] = useState<Comparison[] | null>(null);
  const [loading, setLoading] = useState(false);

  const { ids: favoriteIds } = useFavorites();
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>(null);

  const [copied, setCopied] = useState<null | "shared" | "copied">(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [shoppingOpen, setShoppingOpen] = useState(false);

  // 인기 정렬 fetch
  useEffect(() => {
    setProductsLoading(true);
    fetch("/api/products?limit=1000&sort=popular&slim=true")
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []))
      .finally(() => setProductsLoading(false));
  }, []);

  // 첫 진입 시 자동 위치 요청
  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) return;
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ status: "ready", lat: pos.coords.latitude, lng: pos.coords.longitude });
        setDistanceFilter(5);
      },
      (err) => {
        setGeo({ status: err.code === err.PERMISSION_DENIED ? "denied" : "error" });
      },
      { timeout: 6000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const cartIds = useMemo(() => new Set(cart.map((c) => c.productId)), [cart]);

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
    setResults(null);
  }

  function setQuantity(productId: string, q: number) {
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId ? { ...c, quantity: Math.max(1, q) } : c,
      ),
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

  function requestGeolocation() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGeo({ status: "error" });
      setDistanceFilter(null);
      return;
    }
    setGeo({ status: "loading" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ status: "ready", lat: pos.coords.latitude, lng: pos.coords.longitude });
        setDistanceFilter((prev) => (prev === null && geo.status !== "ready" ? 5 : prev));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeo({ status: "denied" });
        else setGeo({ status: "error" });
        setDistanceFilter(null);
      },
      { timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
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

  useEffect(() => {
    if (geo.status === "ready" && distanceFilter === null) {
      setDistanceFilter(5);
    }
  }, [geo.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredResults = useMemo(() => {
    if (!results) return null;
    return favoriteOnly ? results.filter((r) => favoriteIds.has(r.storeId)) : results;
  }, [results, favoriteOnly, favoriteIds]);

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
    if (geo.status === "ready" && distanceFilter !== null) {
      withDist = withDist.filter((r) => r._distanceKm !== null && r._distanceKm <= distanceFilter);
    }
    withDist.sort((a, b) => a.total - b.total);
    return withDist;
  }, [filteredResults, geo, distanceFilter]);

  const onlineResults = useMemo(() => {
    if (!filteredResults) return [];
    const online = filteredResults.filter(isOnlineStore);
    return [...online].sort((a, b) => a.total - b.total);
  }, [filteredResults]);

  const cartCount = cart.reduce((n, c) => n + c.quantity, 0);

  const cartProductNames = useMemo(
    () =>
      cart
        .map((c) => productMap.get(c.productId)?.name)
        .filter((n): n is string => !!n),
    [cart, productMap],
  );

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
    [cart, productMap],
  );

  function buildShoppingListText(): string {
    const lines: string[] = [];
    lines.push(`🛒 장보기 리스트 (${cart.length}개 · 총 ${cartCount}개)`);
    lines.push("");
    for (const item of cart) {
      const name = productMap.get(item.productId)?.name ?? "(미확인)";
      lines.push(`☐ ${name} × ${item.quantity}`);
    }
    if (results && results.length > 0) {
      const completes = results.filter((r) => r.complete);
      const best = completes.length > 0 ? completes[0] : results[0];
      if (best) {
        lines.push("");
        lines.push(`─ 가장 저렴한 매장: ${best.chainName} ${best.storeName} (${formatWon(best.total)})`);
      }
    }
    return lines.join("\n");
  }

  async function shareShoppingList() {
    if (cart.length === 0) return;
    const text = buildShoppingListText();
    const title = "🛒 장보기 리스트";
    try {
      if (typeof navigator !== "undefined" && typeof (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share === "function") {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ title, text });
        setCopied("shared");
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(null), 2000);
        return;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
    }
    let ok = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch { ok = false; }
    }
    if (ok) {
      setCopied("copied");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(null), 2000);
    }
  }

  const showDistanceFilter = cart.length > 0 && results !== null;

  // hero — 최저가 매장 데이터
  const heroData = useMemo(() => {
    if (!results || results.length === 0) return null;
    const completes = results.filter((r) => r.complete);
    const sorted = (completes.length > 0 ? completes : [...results]).sort((a, b) => a.total - b.total);
    if (sorted.length === 0) return null;
    const cheapest = sorted[0];
    const mostExpensive = sorted[sorted.length - 1];
    const savings = sorted.length >= 2 ? mostExpensive.total - cheapest.total : 0;
    const savingsPct = mostExpensive.total > 0
      ? Math.round((savings / mostExpensive.total) * 100)
      : 0;
    return { cheapest, savings, savingsPct, mostExpensive };
  }, [results]);

  const topThree = useMemo(() => {
    if (!results || results.length === 0) return [];
    const completes = results.filter((r) => r.complete);
    const list = completes.length > 0 ? completes : results;
    return [...list].sort((a, b) => a.total - b.total).slice(0, 3);
  }, [results]);

  // KPI — 특가, 완성도, 거리
  const kpi = useMemo(() => {
    if (!heroData) return null;
    const best = heroData.cheapest as Comparison & { _distanceKm?: number | null };
    const completion = Math.round((best.availableCount / best.totalItems) * 100);
    return {
      total: best.total,
      itemsCovered: best.availableCount,
      itemsTotal: best.totalItems,
      completion,
      distance:
        geo.status === "ready" && best.lat != null && best.lng != null
          ? haversineKm(geo.lat, geo.lng, best.lat, best.lng)
          : null,
    };
  }, [heroData, geo]);

  return (
    <div className="space-y-5 pb-24 md:pb-6">
      <header>
        <Caption>{cart.length > 0 ? `장바구니 · ${cart.length}품목` : "장바구니 비교"}</Caption>
        <h1 className="mt-1.5 text-[26px] md:text-[34px] font-extrabold tracking-[-0.8px] text-ink-1">
          어디서 사면<br className="md:hidden" />{" "}
          <span className="text-brand-500">제일 쌀까요?</span>
        </h1>
      </header>

      {/* 비교 진행 중 스켈레톤 */}
      {loading && !results && cart.length > 0 && (
        <Card raised className="p-5" aria-busy="true">
          <div className="h-3 w-20 bg-surface-muted animate-pulse rounded mb-3" />
          <div className="h-10 w-44 bg-surface-muted animate-pulse rounded mb-2" />
          <div className="h-3 w-28 bg-surface-muted animate-pulse rounded" />
        </Card>
      )}

      {/* Hero — 최저가 매장 그라데이션 카드 */}
      {heroData && kpi && (
        <Card
          raised
          className="p-5 md:p-6 border-brand-500 text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--brand) 0%, var(--brand-hover) 100%)",
          }}
        >
          <div className="font-mono text-[11px] tracking-wider text-white/85 uppercase">
            최저 합계 · {heroData.cheapest.chainName}
          </div>
          <div className="mt-1 text-[42px] md:text-[48px] font-extrabold tabular-nums tracking-[-1.5px] leading-none">
            {formatWon(heroData.cheapest.total)}
          </div>
          {heroData.savings > 0 && (
            <div className="mt-2 text-sm text-white/92">
              가장 비싼 곳 대비 <strong>{formatWon(heroData.savings)} 절약</strong>
              {" "}({heroData.savingsPct}%)
            </div>
          )}
          <div className="mt-3 text-xs text-white/80">
            {heroData.cheapest.storeName}
          </div>
        </Card>
      )}

      {/* KPI 카드 4종 — 데스크톱만 */}
      {kpi && (
        <div className="hidden md:grid grid-cols-3 gap-3">
          <Card className="p-4">
            <Caption>품목 완성도</Caption>
            <div className="mt-2">
              <span className="text-[32px] font-bold tabular-nums">{kpi.itemsCovered}</span>
              <span className="text-base text-ink-3">/{kpi.itemsTotal}</span>
            </div>
            <div
              className={[
                "mt-1 text-xs font-semibold",
                kpi.completion === 100 ? "text-success-text" : kpi.completion >= 75 ? "text-brand-ink" : "text-warning-text",
              ].join(" ")}
            >
              {kpi.completion === 100 ? "한 매장에서 100%" : `한 매장에서 ${kpi.completion}%`}
            </div>
          </Card>
          <Card className="p-4">
            <Caption>매장 수</Caption>
            <div className="mt-2">
              <span className="text-[32px] font-bold tabular-nums text-brand-500">{results?.length ?? 0}</span>
              <span className="text-base text-ink-3 ml-1">곳</span>
            </div>
            <div className="mt-1 text-xs text-ink-3">
              {offlineResults.length}곳 오프라인 · {onlineResults.length}곳 온라인
            </div>
          </Card>
          <Card className="p-4">
            <Caption>도보·거리</Caption>
            {kpi.distance !== null ? (
              <>
                <div className="mt-2">
                  <span className="text-[32px] font-bold tabular-nums">{kpi.distance.toFixed(1)}</span>
                  <span className="text-base text-ink-3 ml-1">km</span>
                </div>
                <div className="mt-1 text-xs text-ink-3">최저가 매장까지</div>
              </>
            ) : (
              <>
                <div className="mt-2 text-[28px] font-bold text-ink-3">—</div>
                <div className="mt-1 text-xs text-ink-3">위치 미설정</div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* TOP 3 가로 스크롤 */}
      {topThree.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-ink-1 text-sm">최저가 TOP 3</h2>
            <span className="text-xs text-ink-3">합계 낮은 순</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory">
            {topThree.map((r, i) => (
              <Card
                key={r.storeId}
                raised={i === 0}
                className={[
                  "shrink-0 w-[220px] snap-start p-4 relative",
                  i === 0 ? "border-2 border-brand-500" : "",
                ].join(" ")}
              >
                {i === 0 && (
                  <span className="absolute top-0 right-0 bg-brand-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-bl-lg">
                    최저가
                  </span>
                )}
                <div className="flex items-center gap-2 mb-2">
                  <ChainLogo src={r.chainLogoUrl} name={r.chainName} size={20} />
                  <span className="text-sm font-bold text-ink-1 truncate">{r.chainName}</span>
                </div>
                <div className="text-xs text-ink-3 truncate mb-2">{r.storeName}</div>
                <Num value={r.total} size={28} weight={800} />
                <div className="text-xs text-ink-3 mt-1">
                  {r.availableCount}/{r.totalItems}개 보유
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-4 md:p-5">
          <h2 className="font-bold text-ink-1 mb-3">상품 찾기</h2>
          <CartProductSearch
            products={products}
            onAdd={addToCart}
            cartIds={cartIds}
            loading={productsLoading}
          />
        </Card>

        <Card className="p-4 md:p-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="font-bold text-ink-1">
              장바구니{" "}
              {cart.length > 0 && (
                <span className="text-xs text-ink-3 font-normal">
                  ({cart.length}종 · 총 {cartCount}개)
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {cart.length > 0 && (
                <Button size="sm" variant="primary" icon={<CartIcon size={14} />} onClick={() => setShoppingOpen(true)}>
                  장보기 시작
                </Button>
              )}
              {cart.length > 0 && (
                <Button size="sm" variant="secondary" onClick={shareShoppingList}>
                  {copied === "shared" ? "보냈어요!" : copied === "copied" ? "복사됨!" : "친구한테 보내기"}
                </Button>
              )}
              {cart.length > 0 && (
                <button onClick={clearCart} className="text-xs text-ink-3 hover:text-danger transition">
                  비우기
                </button>
              )}
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="text-[15px] text-ink-3 text-center py-10 border border-dashed border-line-strong rounded-2xl px-4">
              <span className="hidden md:inline">왼쪽에서 상품을 검색해서 추가하세요</span>
              <span className="md:hidden">위에서 상품을 검색해 추가하세요</span>
            </div>
          ) : (
            <ul className="space-y-2">
              {cart.map((item) => {
                const p = productMap.get(item.productId);
                if (!p && !item.productId) return null;
                return (
                  <li
                    key={item.productId}
                    className="flex items-center gap-2 p-3 border border-line rounded-xl bg-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug text-ink-1 line-clamp-2">
                        {p?.name ?? "(미확인)"}
                      </div>
                      {p?.unit && (
                        <div className="text-xs text-ink-3 truncate mt-0.5">{p.unit}</div>
                      )}
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => setQuantity(item.productId, parseInt(e.target.value) || 1)}
                      className="w-14 h-11 px-2 border border-line-strong rounded-lg text-center text-sm shrink-0 bg-surface text-ink-1"
                      aria-label="수량"
                    />
                    <button
                      onClick={() => removeItem(item.productId)}
                      aria-label="삭제"
                      className="w-11 h-11 shrink-0 text-ink-3 hover:text-danger inline-flex items-center justify-center transition"
                    >
                      <CloseIcon size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <Button
            fullWidth
            variant="primary"
            disabled={loading || cart.length === 0}
            onClick={compare}
            className="hidden md:flex mt-4"
          >
            {loading ? "계산 중..." : "마트별 비교"}
          </Button>
        </Card>
      </div>

      {cartProductNames.length > 0 && <RecipeRecommendations productNames={cartProductNames} />}

      {/* 비교 결과 */}
      {filteredResults && filteredResults.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-ink-1">비교 결과</h2>
            {favoriteIds.size > 0 && (
              <label className="inline-flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer">
                <input type="checkbox" checked={favoriteOnly} onChange={(e) => setFavoriteOnly(e.target.checked)} />
                즐겨찾기 매장만 ({favoriteIds.size})
              </label>
            )}
          </div>

          {/* 거리 필터 */}
          {showDistanceFilter && (
            <>
              {(geo.status === "idle" || geo.status === "loading") && (
                <Card className="p-3 flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-ink-2 flex-1 min-w-[200px] inline-flex items-center gap-1.5">
                    <PinIcon size={16} className="text-ink-3" />
                    가까운 마트만 보고 싶다면 오른쪽 버튼을 눌러주세요
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={geo.status === "loading"}
                    onClick={requestGeolocation}
                  >
                    {geo.status === "loading" ? "위치 확인 중..." : "내 위치 사용"}
                  </Button>
                </Card>
              )}

              {geo.status === "ready" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Caption className="inline-flex items-center gap-1">
                    <PinIcon size={12} /> 거리
                  </Caption>
                  <div className="flex gap-1.5 flex-wrap">
                    {DISTANCE_OPTIONS.map((opt) => {
                      const active = distanceFilter === opt.value;
                      return (
                        <button
                          key={opt.label}
                          onClick={() => setDistanceFilter(opt.value)}
                          className={[
                            "text-xs px-3 py-1.5 rounded-full border transition",
                            active
                              ? "bg-brand-500 border-brand-500 text-white"
                              : "bg-surface border-line-strong text-ink-2 hover:bg-surface-muted",
                          ].join(" ")}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {(geo.status === "denied" || geo.status === "error") && (
                <div className="text-xs text-ink-3 bg-surface-muted border border-line rounded-xl px-3 py-2">
                  {geo.status === "denied"
                    ? "위치 권한이 없어 거리 필터를 사용할 수 없습니다"
                    : "위치를 가져올 수 없어 거리 필터를 사용할 수 없습니다"}
                </div>
              )}
            </>
          )}

          {filteredResults && filteredResults.length === 0 && results && results.length > 0 && (
            <div className="bg-surface-muted border border-line rounded-2xl px-4 py-6 text-center text-sm text-ink-2">
              {favoriteOnly
                ? "즐겨찾기 매장에는 이 상품들이 등록되지 않았어요"
                : "비교할 매장이 없어요"}
              {favoriteOnly && (
                <div>
                  <button
                    onClick={() => setFavoriteOnly(false)}
                    className="text-xs text-brand-500 hover:underline mt-2"
                  >
                    즐겨찾기 필터 해제하고 전체 보기
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="font-bold text-sm mb-2 text-ink-2 inline-flex items-center gap-1.5">
              <StoreIcon size={16} className="text-ink-2" />
              오프라인 매장 ({offlineResults.length}개)
            </h3>
            {offlineResults.length === 0 ? (
              <div className="bg-surface-muted border border-line rounded-2xl px-4 py-5 text-center text-sm text-ink-2">
                {geo.status === "ready" && distanceFilter !== null ? (
                  <>
                    {distanceFilter}km 이내 매장에는 등록되지 않았습니다.
                    <br />
                    <button
                      onClick={() => setDistanceFilter(null)}
                      className="text-xs text-brand-500 hover:underline mt-2"
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
                    bestTotal={offlineResults[0]?.total ?? r.total}
                  />
                ))}
              </CollapsibleList>
            )}
          </div>

          <div>
            <h3 className="font-bold text-sm mb-2 text-ink-2 inline-flex items-center gap-1.5">
              <CartIcon size={16} className="text-ink-2" />
              온라인 매장 ({onlineResults.length}개)
            </h3>
            {onlineResults.length === 0 ? (
              <div className="bg-surface-muted border border-line rounded-2xl px-4 py-5 text-center text-sm text-ink-2">
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
                    bestTotal={onlineResults[0]?.total ?? r.total}
                  />
                ))}
              </CollapsibleList>
            )}
          </div>

          {cart.length > 0 && (
            <Button
              fullWidth
              size="lg"
              variant="primary"
              icon={<CartIcon size={20} />}
              iconRight={<ChevronIcon size={18} />}
              onClick={() => setShoppingOpen(true)}
              className="mt-2"
            >
              장보기 시작 — 큰 글씨로 체크하기
            </Button>
          )}
        </section>
      )}

      {filteredResults && filteredResults.length === 0 && (
        <div className="text-sm text-ink-3 text-center py-6">
          조건에 맞는 매장이 없습니다.
        </div>
      )}

      {!results && (
        <div className="text-xs text-ink-3 text-center pt-2">
          가격이 부족하다면{" "}
          <Link href="/upload" className="text-brand-500 hover:underline">
            영수증을 올려주세요
          </Link>
          .
        </div>
      )}

      {/* 모바일 고정 비교 버튼 */}
      <div
        className="md:hidden fixed bottom-[80px] left-0 right-0 px-4 z-30 pointer-events-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Button
          fullWidth
          size="lg"
          variant="primary"
          disabled={loading || cart.length === 0}
          onClick={compare}
          className="pointer-events-auto shadow-pop"
        >
          {loading
            ? "계산 중..."
            : cart.length === 0
              ? "장바구니가 비어있어요"
              : `마트별 비교 (${cart.length}종)`}
        </Button>
      </div>

      {shoppingOpen && cart.length > 0 && (
        <ShoppingMode items={shoppingItems} onClose={() => setShoppingOpen(false)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ComparisonCard — 시안 StoreCard 그대로.
// 최저가 매장은 2px brand border + ribbon. 완성도 progress bar.
// 가격 차이는 '+₩X,XXX' 빨간 캡션으로 노출.
// ─────────────────────────────────────────────────────────────
function ComparisonCard({
  r,
  isCheapest,
  isFavorite,
  distanceKm,
  bestTotal,
}: {
  r: Comparison;
  isCheapest: boolean;
  isFavorite: boolean;
  distanceKm: number | null;
  bestTotal: number;
}) {
  const completion = Math.round((r.availableCount / r.totalItems) * 100);
  const missing = r.totalItems - r.availableCount;
  const diff = r.total - bestTotal;

  return (
    <Card
      raised={isCheapest}
      className={["relative p-0 overflow-hidden", isCheapest ? "border-2 border-brand-500" : ""].join(" ")}
    >
      {isCheapest && (
        <span className="absolute top-0 right-0 bg-brand-500 text-white text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-xl">
          최저가
        </span>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-surface-muted border border-line flex items-center justify-center text-ink-2 shrink-0">
            <ChainLogo src={r.chainLogoUrl} name={r.chainName} size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-ink-1 tracking-tight">{r.chainName}</span>
              {isFavorite && <Badge tone="warning" className="text-[10px]">★ 즐겨찾기</Badge>}
              {distanceKm !== null && (
                <span className="text-[11px] text-ink-3 bg-surface-muted px-1.5 py-0.5 rounded font-mono">
                  {distanceKm < 10 ? distanceKm.toFixed(1) : distanceKm.toFixed(0)}km
                </span>
              )}
            </div>
            <div className="text-xs text-ink-3 mt-0.5 truncate">{r.storeName}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 items-end">
          <div>
            <Caption>합계</Caption>
            <div className="mt-1">
              <Num
                value={r.total}
                size={isCheapest ? 26 : 22}
                weight={700}
                color={isCheapest ? "var(--brand)" : "var(--ink-1)"}
              />
            </div>
            {isCheapest ? (
              <div className="text-[11px] text-success-text font-mono mt-0.5">기준</div>
            ) : diff > 0 ? (
              <div className="text-[11px] text-danger font-mono mt-0.5 tabular-nums">
                +{diff.toLocaleString("ko-KR")}원
              </div>
            ) : null}
          </div>
          <div>
            <Caption>완성도</Caption>
            <div className="mt-1 text-[18px] font-bold tabular-nums">
              {r.availableCount}
              <span className="text-[13px] text-ink-3">/{r.totalItems}</span>
              <span className="text-xs text-ink-3 ml-1.5 font-medium">{completion}%</span>
            </div>
            <Progress
              value={completion}
              tone={completion === 100 ? "success" : completion >= 75 ? "brand" : "warning"}
              height={4}
              className="mt-1"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {missing > 0 && (
            <Badge tone="danger">미보유 {missing}건</Badge>
          )}
        </div>
      </div>

      <details className="border-t border-line">
        <summary className="px-4 py-2.5 text-xs text-ink-3 cursor-pointer hover:bg-surface-muted transition">
          품목별 가격 보기
        </summary>
        <ul className="text-xs bg-surface-muted/50">
          {r.lines.map((l) => {
            const isMin = l.available && l.lineTotal !== null;
            return (
              <li
                key={l.productId}
                className={[
                  "flex justify-between border-t border-line px-4 py-2 text-ink-2",
                  l.available ? "" : "bg-danger-soft/50",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex items-center gap-1.5 min-w-0 truncate",
                    l.available ? "" : "line-through text-danger",
                  ].join(" ")}
                >
                  {l.productName} × {l.quantity}
                </span>
                <span className={l.available ? "tabular-nums font-medium" : "text-danger font-medium"}>
                  {isMin && l.lineTotal !== null ? formatWon(l.lineTotal) : "취급 안 함"}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </Card>
  );
}
