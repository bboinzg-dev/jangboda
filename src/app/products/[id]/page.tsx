import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatWon } from "@/lib/format";
import { unitPriceValue } from "@/lib/units";
import { notFound } from "next/navigation";
import { isOnlineStore } from "@/components/SourceBadge";
import PriceAlertButton from "@/components/PriceAlertButton";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import PriceListClient, { type PriceRowData } from "@/components/PriceListClient";
import EmptyState from "@/components/EmptyState";
import IngredientsPanel from "@/components/IngredientsPanel";
import NutritionPanel from "@/components/NutritionPanel";
import AgriTraceLookup from "@/components/AgriTraceLookup";
import HealthFunctionalPanel from "@/components/HealthFunctionalPanel";
import CattleTracePanel from "@/components/CattleTracePanel";
import SeafoodTracePanel from "@/components/SeafoodTracePanel";
import ProductImage from "@/components/ProductImage";

export const revalidate = 30;

type PriceRow = PriceRowData;

type HistoryPoint = {
  date: Date;
  price: number;
  chainName: string;
};

async function getProductDetail(id: string) {
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { aliases: true },
    });
    if (!product) return null;

    // 한 번의 쿼리로 이 productId의 모든 가격 가져오기 (N+1 회피)
    // store 정보는 join으로 같이. take 5000 제한 (메모리 보호)
    // source=stats_official(통계청 시세)는 매장이 아니라 시세이므로 매장 비교에서 제외
    const allPrices = await prisma.price.findMany({
      where: {
        productId: id,
        source: { not: "stats_official" },
      },
      include: { store: { include: { chain: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    // storeId별로 그룹 — 가장 최근 가격 + 등록 횟수 + 최신 날짜
    type Aggregate = {
      latestPrice: (typeof allPrices)[number];
      count: number;
      latestDate: Date;
    };
    const byStore = new Map<string, Aggregate>();
    for (const p of allPrices) {
      // store 또는 chain이 어떤 이유로든 null이면 skip (방어)
      if (!p.store || !p.store.chain) continue;
      const cur = byStore.get(p.storeId);
      if (!cur) {
        byStore.set(p.storeId, { latestPrice: p, count: 1, latestDate: p.createdAt });
      } else {
        cur.count += 1;
        if (p.createdAt > cur.latestDate) cur.latestDate = p.createdAt;
      }
    }

    const valid: PriceRow[] = [];
    for (const { latestPrice: p, count, latestDate } of byStore.values()) {
      const chainName = p.store?.chain?.name ?? "(미상)";
      valid.push({
        priceId: p.id,
        storeId: p.storeId,
        storeName: p.store?.name ?? "(미상)",
        chainName,
        lat: p.store?.lat ?? 0,
        lng: p.store?.lng ?? 0,
        price: p.price,
        updatedAt: p.createdAt,
        source: p.source,
        productUrl: p.productUrl,
        online: isOnlineStore({
          lat: p.store?.lat ?? 0,
          lng: p.store?.lng ?? 0,
          name: p.store?.name ?? "",
          chainName,
        }),
        trust: { count, latestDate },
      });
    }

    // 가격 추이용 history — 최근 60일, source != 'naver'
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const history: HistoryPoint[] = allPrices
      .filter(
        (p) =>
          p.store?.chain &&
          p.source !== "naver" &&
          p.createdAt.getTime() >= sixtyDaysAgo
      )
      .slice(-200) // 그래프 점 200개 limit (렌더 보호)
      .map((p) => ({
        date: p.createdAt,
        price: p.price,
        chainName: p.store?.chain?.name ?? "(미상)",
      }))
      .reverse();

    return { product, prices: valid, history };
  } catch (e) {
    console.error("[products/[id]] getProductDetail error:", {
      productId: id,
      error: e instanceof Error ? { message: e.message, stack: e.stack } : e,
    });
    throw e; // 에러 가시화 위해 다시 throw — error.tsx가 잡음
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getProductDetail(params.id);
  if (!data) return notFound();
  const { product, prices, history } = data;

  const offlineRows = prices.filter((p) => !p.online);
  const onlineRows = prices.filter((p) => p.online);

  // 시세(KAMIS) + 통계청 데이터는 매장 가격이 아니라 시세 정보 → 헤더 통계 오염 방지 위해 제외
  const isMarketRate = (s: string) => s === "kamis" || s === "stats_official";

  // 단가 outlier 판정 — 단가 median ±50% 벗어난 가격은 통계 비교 제외
  // (PriceListClient의 분리 로직과 동일 기준 — 매장 카드와 헤더 숫자 일관성 확보)
  const validUnitPrices = prices
    .map((p) => unitPriceValue(p.price, product.unit))
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  const upMedian =
    validUnitPrices.length >= 3
      ? validUnitPrices[Math.floor(validUnitPrices.length / 2)]
      : null;
  const lowBound = upMedian !== null ? upMedian * 0.5 : null;
  const highBound = upMedian !== null ? upMedian * 1.5 : null;
  const isUnitOutlier = (price: number): boolean => {
    if (lowBound === null || highBound === null) return false;
    const u = unitPriceValue(price, product.unit);
    if (u === null) return false;
    return u < lowBound || u > highBound;
  };

  // 헤더 "전체 최저가/최고가/가격차"는 매장 카드 리스트와 동일한 기준으로 계산 —
  // 시세(KAMIS) 제외 + 단가 outlier 제외. 표시되지 않은 값이 max를 잡는 모순 방지.
  const headlinePrices = prices
    .filter((p) => !isMarketRate(p.source) && !isUnitOutlier(p.price))
    .map((p) => p.price)
    .filter((x) => x > 0);
  // 모두 outlier로 빠진 극단 케이스 — raw로 fallback
  const fallbackPrices = prices.map((p) => p.price).filter((x) => x > 0);
  const statPool = headlinePrices.length > 0 ? headlinePrices : fallbackPrices;
  const minPrice = statPool.length > 0 ? Math.min(...statPool) : 0;
  const maxPrice = statPool.length > 0 ? Math.max(...statPool) : 0;
  const excludedCount = fallbackPrices.length - headlinePrices.length;

  const offlineMarket = offlineRows.filter(
    (r) => !isMarketRate(r.source) && !isUnitOutlier(r.price)
  );
  const onlineMarket = onlineRows.filter(
    (r) => !isMarketRate(r.source) && !isUnitOutlier(r.price)
  );
  const winnerSection =
    offlineMarket.length > 0 && onlineMarket.length > 0
      ? Math.min(...offlineMarket.map((r) => r.price)) <
        Math.min(...onlineMarket.map((r) => r.price))
        ? "offline"
        : "online"
      : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/search" className="text-sm text-ink-3 hover:underline">
          ← 검색으로
        </Link>
      </div>

      <header className="bg-white border border-line rounded-xl p-6">
        {/* 좌측 큰 썸네일 + 우측 메타 — 모바일은 세로 스택 */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            size={128}
            className="self-center sm:self-start"
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink-3">{product.category}</div>
            {/* 상품명 + 단위 + HACCP 배지 그룹 */}
            <div className="mt-1 space-y-1">
              <h1 className="text-2xl font-extrabold text-ink-1 tracking-tight flex items-center gap-2 flex-wrap">
                <span>{product.name}</span>
                {product.hasHaccp && (
                  <span
                    className="inline-flex items-center rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-xs font-medium"
                    title="HACCP 적용업소 — 식약처 안전관리인증 받은 제조사"
                  >
                    🏅 HACCP
                  </span>
                )}
              </h1>
              <div className="text-ink-2 text-sm">
                {product.brand} · {product.unit}
              </div>
            </div>
          </div>
        </div>

        {/* 제조/원산지/등급/인증 정보 */}
        {(product.manufacturer ||
          product.origin ||
          product.grade ||
          (product.certifications && product.certifications.length > 0)) && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {product.manufacturer && (
              <div className="bg-surface-muted rounded px-2 py-1.5">
                <div className="text-[10px] text-ink-3">제조</div>
                <div className="font-medium text-ink-2 truncate">
                  {product.manufacturer}
                </div>
              </div>
            )}
            {product.origin && (
              <div className="bg-surface-muted rounded px-2 py-1.5">
                <div className="text-[10px] text-ink-3">원산지</div>
                <div className="font-medium text-ink-2 truncate">
                  {product.origin}
                </div>
              </div>
            )}
            {product.grade && (
              <div className="bg-amber-50 rounded px-2 py-1.5">
                <div className="text-[10px] text-amber-700">등급</div>
                <div className="font-medium text-amber-800 truncate">
                  {product.grade}
                </div>
              </div>
            )}
            {product.certifications && product.certifications.length > 0 && (
              <div className="bg-emerald-50 rounded px-2 py-1.5">
                <div className="text-[10px] text-emerald-700">인증</div>
                <div className="font-medium text-emerald-800 truncate">
                  {product.certifications.join(", ")}
                </div>
              </div>
            )}
          </div>
        )}
        {product.description && (
          <div className="mt-2 text-xs text-ink-3">
            {product.description}
          </div>
        )}

        {prices.length > 0 && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <PriceStat label="전체 최저가" value={formatWon(minPrice)} highlight />
              <PriceStat label="전체 최고가" value={formatWon(maxPrice)} />
              <PriceStat label="가격차" value={formatWon(maxPrice - minPrice)} />
            </div>
            {excludedCount > 0 && (
              <div className="mt-2 text-[11px] text-ink-3">
                {statPool.length}건 비교 · 시세/이상치 {excludedCount}건 제외
              </div>
            )}
          </>
        )}

        {winnerSection && (
          <div className="mt-4 text-sm bg-brand-50 border border-brand-200 rounded-xl p-3">
            💡{" "}
            {winnerSection === "offline"
              ? "오프라인 매장이 더 쌉니다 — 가까우면 직접 사러 가는 게 이득"
              : "온라인이 더 쌉니다 — 시키는 게 이득 (배송비 별도 확인)"}
          </div>
        )}
        <div className="mt-4">
          <PriceAlertButton
            productId={product.id}
            productName={product.name}
            currentMinPrice={minPrice}
          />
        </div>
      </header>

      {/* 가격 추이 차트 — hero 바로 아래 위치 (핸드오프 룰) */}
      <section>
        <h2 className="font-bold text-ink-1 mb-3 flex items-center gap-2">
          📈 가격 추이
          <span className="text-xs text-ink-3 font-normal">
            (최근 60일, 매장별)
          </span>
        </h2>
        <PriceHistoryChart history={history} />
      </section>

      {/* 가격 비교 — 핵심 가치, 헤더 바로 아래로 이동 */}
      {/* 오프라인/온라인 모두 0건 — 통합 빈 상태 */}
      {offlineRows.length === 0 && onlineRows.length === 0 ? (
        <EmptyState
          illustration="/illustrations/empty-cart.png"
          icon="🏷️"
          title="이 상품은 아직 매장에 등록되지 않았습니다"
          description={
            <>
              영수증을 올리거나 직접 입력해서 첫 가격을 등록해보세요.
              <br />
              온라인 쇼핑몰 가격은 네이버 쇼핑 동기화로 한 번에 가져올 수 있어요.
            </>
          }
          actions={[
            { href: "/upload", label: "📸 영수증 올리기", primary: true },
            { href: "/sync", label: "🔄 네이버 쇼핑 동기화" },
          ]}
        />
      ) : (
        <>
          <section>
            <h2 className="font-bold text-ink-1 mb-3 flex items-center gap-2">
              🛒 오프라인 매장
              <span className="text-xs text-ink-3 font-normal">
                ({offlineRows.length}개 매장, 낮은 순)
              </span>
            </h2>
            <PriceListClient
              unit={product.unit}
              rows={offlineRows}
              emptyHint={
                <>
                  아직 등록된 오프라인 가격이 없습니다.
                  <br />
                  <Link
                    href="/upload"
                    className="text-brand-600 hover:underline font-medium"
                  >
                    영수증 올리고 첫 가격 등록하기 →
                  </Link>
                </>
              }
            />
          </section>

          <section>
            <h2 className="font-bold text-ink-1 mb-3 flex items-center gap-2">
              📦 온라인 쇼핑몰
              <span className="text-xs text-ink-3 font-normal">
                ({onlineRows.length}개 몰, 낮은 순)
              </span>
            </h2>
            <PriceListClient
              showFavoriteFilter={false}
              unit={product.unit}
              rows={onlineRows}
              emptyHint={
                <>
                  아직 등록된 온라인 가격이 없습니다.
                  <br />
                  <Link
                    href="/sync"
                    className="text-brand-600 hover:underline font-medium"
                  >
                    네이버 쇼핑 동기화로 한 번에 가져오기 →
                  </Link>
                </>
              }
            />
          </section>
        </>
      )}

      {/* 부가 정보 패널 6종 — 기본 닫힘, 사용자가 클릭 시 펼침 */}
      <details className="group">
        <summary className="cursor-pointer p-4 bg-white border border-line rounded-xl font-semibold text-ink-1 flex items-center justify-between hover:bg-surface-muted">
          <span>📋 상품 상세 정보 (원재료 · 영양 · 이력추적)</span>
          <span className="text-ink-3 transition-transform group-open:rotate-180">
            ▼
          </span>
        </summary>
        <div className="mt-3 space-y-6">
          {/* 원재료 정보 — 농수산물(KAMIS)은 C002에 데이터 없음 → 스킵 */}
          {product.category !== "농수산물" && (
            <IngredientsPanel productId={product.id} />
          )}

          {/* 영양 정보 — 식품영양성분DB는 가공식품/농수산물 모두 보유 → 모든 카테고리 표시 */}
          <NutritionPanel productId={product.id} />

          {/* 농산물이력추적 — 농수산물(KAMIS)에만 표시 */}
          {product.category === "농수산물" && (
            <AgriTraceLookup productName={product.name} />
          )}

          {/* 건강기능식품 정보 — 매칭 없고 일반 상품 카테고리면 자체적으로 미표시 */}
          <HealthFunctionalPanel
            productId={product.id}
            productName={product.name}
            productCategory={product.category}
          />

          {/* 쇠고기 이력추적 — 한우/쇠고기/소고기/정육 상품에서만 자체적으로 노출 */}
          <CattleTracePanel
            productCategory={product.category}
            productName={product.name}
          />

          {/* 수산물 이력추적 — 수산물/해산물 카테고리 또는 어종 키워드 매칭 시 자체 노출 */}
          <SeafoodTracePanel
            productCategory={product.category}
            productName={product.name}
          />
        </div>
      </details>
    </div>
  );
}

function PriceStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 ${
        highlight ? "bg-brand-50 border border-brand-200" : "bg-surface-muted"
      }`}
    >
      <div className="text-xs text-ink-3">{label}</div>
      <div
        className={`text-2xl font-extrabold tabular-nums tracking-tight ${
          highlight ? "text-brand-600" : "text-ink-1"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
