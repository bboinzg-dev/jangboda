import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatWon } from "@/lib/format";
import { unitPriceLabel, unitPriceValue } from "@/lib/units";
import { notFound } from "next/navigation";
import { isOnlineStore } from "@/components/SourceBadge";
import { isOnlineOnlyChain } from "@/lib/onlineMalls";
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
import FoodSafetyPanel from "@/components/FoodSafetyPanel";
import ProductImage from "@/components/ProductImage";

// 가격은 보통 매시간 cron으로만 갱신 → 5분 ISR + 30분 SWR로 캐시 적중률 ↑
export const revalidate = 300;

type PriceRow = PriceRowData;

type HistoryPoint = {
  date: Date;
  price: number;
  chainName: string;
};

// 제조사명 정규화 — "(주)농심" / "농심㈜" / "농심 주식회사" 동일하게 (회수 fallback 매칭용)
function normalizeManufacturer(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[()（）\[\]【】㈜주식회사\s.,\-_]/g, "")
    .replace(/co\.?ltd\.?|inc\.?|corp\.?/gi, "");
}

function nameTokenOverlap(recallName: string, productName: string): number {
  const tok = (s: string) =>
    s
      .toLowerCase()
      .replace(/[()（）\[\]【】·,\-_/+]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  const rt = tok(recallName);
  if (rt.length === 0) return 0;
  const ptSet = new Set(tok(productName));
  let hit = 0;
  for (const t of rt) if (ptSet.has(t)) hit++;
  return hit / rt.length;
}

async function getProductDetail(id: string) {
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { aliases: true },
    });
    if (!product) return null;

    // 회수 정보 매칭 (식약처 I0490)
    // 1순위: barcode 정확매칭 (확실)
    // 2순위(fallback): barcode 없는 회수 + 정규화 manufacturer 일치 + productName 토큰 60%↑
    //   (식약처 회수 354건 중 ~38%가 barcode 누락 — 농수산물·소분식품)
    const recallSelect = {
      id: true,
      productName: true,
      manufacturer: true,
      reason: true,
      grade: true,
      registeredAt: true,
      recallMethod: true,
    } as const;
    type RecallRow = {
      id: string;
      productName: string;
      manufacturer: string | null;
      reason: string;
      grade: string | null;
      registeredAt: Date;
      recallMethod: string | null;
      matchType?: "exact" | "fuzzy";
      score?: number;
    };
    const recalls: RecallRow[] = [];
    const recallIdSet = new Set<string>();
    if (product.barcode) {
      const exact = await prisma.recall.findMany({
        where: { barcode: product.barcode },
        orderBy: { registeredAt: "desc" },
        take: 5,
        select: recallSelect,
      });
      for (const r of exact) {
        recalls.push({ ...r, matchType: "exact" });
        recallIdSet.add(r.id);
      }
    }
    // fallback — product.manufacturer 있을 때만 (오탐 방지)
    if (product.manufacturer && recalls.length < 5) {
      const mfrNorm = normalizeManufacturer(product.manufacturer);
      if (mfrNorm) {
        // 같은 정규화 제조사의 barcode-less 회수만 후보
        // (DB 인덱스가 manufacturer raw 기준이라 후보군은 메모리에서 정규화 비교)
        const candidates = await prisma.recall.findMany({
          where: { barcode: null, manufacturer: { not: null } },
          orderBy: { registeredAt: "desc" },
          take: 200,
          select: recallSelect,
        });
        for (const r of candidates) {
          if (recallIdSet.has(r.id)) continue;
          if (!r.manufacturer || normalizeManufacturer(r.manufacturer) !== mfrNorm) continue;
          const score = nameTokenOverlap(r.productName, product.name);
          if (score >= 0.6) {
            recalls.push({ ...r, matchType: "fuzzy", score });
            recallIdSet.add(r.id);
            if (recalls.length >= 5) break;
          }
        }
      }
    }
    // 정확매칭 우선, 그 안에서 최신순
    recalls.sort((a, b) => {
      if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
      return b.registeredAt.getTime() - a.registeredAt.getTime();
    });

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
      // 통계·정렬용 가격은 정가(listPrice) 기준 — 행사가는 보조 표시 전용 (행사 만료 추정 불가 정책)
      valid.push({
        priceId: p.id,
        storeId: p.storeId,
        storeName: p.store?.name ?? "(미상)",
        chainName,
        lat: p.store?.lat ?? 0,
        lng: p.store?.lng ?? 0,
        price: p.listPrice,
        listPrice: p.listPrice,
        paidPrice: p.paidPrice ?? null,
        promotionType: p.promotionType ?? null,
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
        metadata: (p.metadata as Record<string, unknown> | null) ?? null,
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
        price: p.listPrice,
        chainName: p.store?.chain?.name ?? "(미상)",
      }))
      .reverse();

    return { product, prices: valid, history, recalls };
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
  const { product, prices, history, recalls } = data;

  // 시세(KAMIS) + 통계청 데이터는 매장 가격이 아니라 시세 정보 → 헤더 통계 오염 방지 위해 제외
  const isMarketRate = (s: string) => s === "kamis" || s === "stats_official";

  // outlier 판정 — source 신뢰도 기반
  //
  // 정책: "가격으로 자르지 않고 source 신뢰도로 자른다"
  // - parsa(한국소비자원)/kamis/stats_official/receipt/manual/seed/csv = 검증된 source → outlier 적용 X
  //   (백화점·전문점이 정상적으로 비싸게 파는 케이스도 그대로 통과)
  // - naver(호가성) 또는 ONLINE_ONLY_CHAINS(옥션·G마켓·기타 온라인몰) = 호가 가능성
  //   → median 기준 outlier 적용
  //
  // bound 비대칭: low=×0.3 (정상 저가 관대), high=×1.5 (호가 적극 컷)
  const NOISY_SOURCES = new Set(["naver"]);
  const isNoisyRow = (source: string, chainName: string) =>
    NOISY_SOURCES.has(source) || isOnlineOnlyChain(chainName);

  const LOW_RATIO = 0.3;
  const HIGH_RATIO = 1.5;
  const validUnitPrices = prices
    .map((p) => unitPriceValue(p.price, product.unit))
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  const upMedian =
    validUnitPrices.length >= 3
      ? validUnitPrices[Math.floor(validUnitPrices.length / 2)]
      : null;
  const validPricesSorted = prices
    .map((p) => p.price)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const priceMedian =
    validPricesSorted.length >= 3
      ? validPricesSorted[Math.floor(validPricesSorted.length / 2)]
      : null;
  const isUnitOutlier = (price: number, source: string, chainName: string): boolean => {
    // 신뢰 source는 가격대 무관 통과 — 백화점 정상가 보존
    if (!isNoisyRow(source, chainName)) return false;
    if (upMedian !== null) {
      const u = unitPriceValue(price, product.unit);
      if (u !== null) return u < upMedian * LOW_RATIO || u > upMedian * HIGH_RATIO;
    }
    if (priceMedian !== null) {
      return price < priceMedian * LOW_RATIO || price > priceMedian * HIGH_RATIO;
    }
    return false;
  };

  // 온라인 섹션의 호가/단위불일치 사전 컷:
  // - 호가성(naver/온라인전용chain)인데 outlier → page level에서 미리 제거
  // - "기타 온라인몰" (canonicalMallName 미매칭) — 마이너 셀러는 같은 product 이름이라도
  //   사양이 다른 경우 多 (예: 12개입 vs 24개입). 단위 검증 못 하므로 항상 hide.
  // 제외 건수는 별도로 보존 → "아직 없음"이 아니라 "N건 호가성 자동 제외"로 정직하게 표시.
  //
  // KAMIS 시세는 매장 가격이 아니라 공공 시세(전국 평균) — "오프라인 매장"에 섞이면
  // 사용자가 매장 가격으로 오해함. 별도 marketRateRows로 분리해 "📊 공공 시세 (참고)"로 표시.
  const allOfflineRows = prices.filter((p) => !p.online);
  const marketRateRows = allOfflineRows.filter((p) => isMarketRate(p.source));
  const offlineRows = allOfflineRows.filter((p) => !isMarketRate(p.source));
  const allOnlineRows = prices.filter((p) => p.online);
  const onlineRows = allOnlineRows.filter(
    (p) =>
      p.chainName !== "기타 온라인몰" &&
      !isUnitOutlier(p.price, p.source, p.chainName),
  );
  const onlineHiddenCount = allOnlineRows.length - onlineRows.length;

  // 헤더 "전체 최저가/최고가/가격차"는 사용자가 실제로 보는 가격(visibleRows)만으로 계산.
  // 안 보이는 가격(KAMIS 시세 / 호가성 outlier / 기타 온라인몰)이 통계에 들어가면
  // "최고가 21,900원이 어디서 나왔지?" 인지 부조화 발생. fallback 없음 — 비교 가능 가격이
  // 0건이면 헤더 통계 자체를 숨기고 안내 메시지만 표시.
  const headlinePrices = prices
    .filter(
      (p) =>
        !isMarketRate(p.source) &&
        !isUnitOutlier(p.price, p.source, p.chainName) &&
        p.chainName !== "기타 온라인몰",
    )
    .map((p) => p.price)
    .filter((x) => x > 0);
  const allPositivePrices = prices.map((p) => p.price).filter((x) => x > 0);
  const minPrice = headlinePrices.length > 0 ? Math.min(...headlinePrices) : 0;
  const maxPrice = headlinePrices.length > 0 ? Math.max(...headlinePrices) : 0;
  const excludedCount = allPositivePrices.length - headlinePrices.length;

  // offlineRows는 이미 marketRate 제외됨, onlineRows는 이미 outlier·기타온라인몰 제외됨
  const offlineMarket = offlineRows.filter(
    (r) => !isUnitOutlier(r.price, r.source, r.chainName)
  );
  const onlineMarket = onlineRows;
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

        {/* ⚠️ 회수 경고 — 식약처 회수 매칭 (1순위 바코드 정확매칭, fallback 제조사+제품명) */}
        {recalls.length > 0 && (() => {
          const top = recalls[0];
          const isFuzzy = top.matchType === "fuzzy";
          // fuzzy는 "추정"으로 약하게, exact는 "확정" 강하게
          const tone = isFuzzy
            ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-rose-300 bg-rose-50 text-rose-900";
          const subTone = isFuzzy ? "text-amber-700" : "text-rose-700";
          return (
            <div className={`mt-4 rounded-xl border-2 p-4 ${tone}`}>
              <div className="flex items-start gap-2">
                <span className="text-2xl leading-none">⚠️</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">
                      {isFuzzy ? "회수 대상 추정 상품" : "회수 대상 상품"}
                    </span>
                    {top.grade && (
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${
                          isFuzzy ? "bg-amber-700" : "bg-rose-700"
                        }`}
                      >
                        {top.grade}
                      </span>
                    )}
                    {isFuzzy && top.score !== undefined && (
                      <span className={`text-[11px] ${subTone}`}>
                        매칭 정확도 {Math.round(top.score * 100)}%
                      </span>
                    )}
                    <span className={`text-[11px] ${subTone}`}>
                      {top.registeredAt.toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}{" "}
                      식약처 등록
                    </span>
                  </div>
                  <div className="mt-1 text-sm">
                    <span className="font-medium">회수명:</span> {top.productName}
                  </div>
                  <div className="mt-0.5 text-sm">
                    <span className="font-medium">사유:</span> {top.reason}
                  </div>
                  {top.recallMethod && (
                    <div className="mt-0.5 text-xs">
                      <span className="font-medium">조치:</span> {top.recallMethod}
                    </div>
                  )}
                  {recalls.length > 1 && (
                    <details className="mt-2 text-xs">
                      <summary className={`cursor-pointer font-medium ${subTone}`}>
                        다른 회수 이력 {recalls.length - 1}건 보기
                      </summary>
                      <ul className="mt-2 space-y-1.5 pl-2">
                        {recalls.slice(1).map((r) => (
                          <li
                            key={r.id}
                            className={`border-l-2 pl-2 ${
                              r.matchType === "fuzzy"
                                ? "border-amber-300"
                                : "border-rose-300"
                            }`}
                          >
                            <div className={subTone}>
                              {r.registeredAt.toLocaleDateString("ko-KR")}
                              {r.grade && ` · ${r.grade}`}
                              {r.matchType === "fuzzy" &&
                                ` · 추정 ${Math.round((r.score ?? 0) * 100)}%`}
                            </div>
                            <div>{r.reason}</div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className={`mt-2 text-[11px] ${subTone}`}>
                    {isFuzzy
                      ? "바코드가 없는 회수 — 제조사·제품명 매칭으로 추정한 결과입니다. 확인이 필요합니다."
                      : "같은 바코드(EAN)로 매칭된 회수 정보입니다."}{" "}
                    출처: 식약처 회수판매중지 공개데이터
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

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

        {headlinePrices.length > 0 ? (
          <>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <PriceStat
                label="전체 최저가"
                value={formatWon(minPrice)}
                subValue={unitPriceLabel(minPrice, product.unit)}
                highlight
              />
              <PriceStat
                label="전체 최고가"
                value={formatWon(maxPrice)}
                subValue={unitPriceLabel(maxPrice, product.unit)}
              />
              <PriceStat
                label="가격차"
                value={formatWon(maxPrice - minPrice)}
              />
            </div>
            {excludedCount > 0 && (
              <div className="mt-2 text-[11px] text-ink-3">
                {headlinePrices.length}건 비교 · 시세/이상치 {excludedCount}건 제외
              </div>
            )}
          </>
        ) : prices.length > 0 ? (
          // 가격은 있는데 모두 시세/호가성/기타 온라인몰 — 비교용 데이터 부족
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
            아직 비교 가능한 매장 가격이 없어요. 영수증을 올리면 첫 가격으로 등록됩니다.
          </div>
        ) : null}

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

      {/* 공공 시세 (KAMIS) — 매장 가격이 아니라 전국 평균 시세, 별도 영역으로 분리.
          매장 가격과 같은 칸에 두면 "어느 매장 가격이지?" 오해 발생.
          metadata에 changePct/previousPrice/weeklyAverage 있으면 변동 정보도 노출. */}
      {marketRateRows.length > 0 && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <h2 className="font-bold text-emerald-900 mb-1 flex items-center gap-2 text-sm">
            📊 공공 시세 (참고)
            <span className="text-[11px] text-emerald-700 font-normal">
              KAMIS 전국 평균 — 매장 가격 아님
            </span>
          </h2>
          <div className="space-y-3 mt-2">
            {marketRateRows.map((r) => {
              const meta = r.metadata as
                | {
                    changePct?: number;
                    changeAmount?: number;
                    previousPrice?: number;
                    weeklyAverage?: number;
                  }
                | null;
              const changePct = meta?.changePct;
              const changeAmount = meta?.changeAmount;
              const weeklyAvg = meta?.weeklyAverage;
              const isUp = changePct != null && changePct > 0;
              const isDown = changePct != null && changePct < 0;
              const updatedDate = new Date(r.updatedAt);
              return (
                <div key={r.priceId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-emerald-900">{r.chainName}</span>
                    <span className="font-bold tabular-nums text-emerald-900">
                      {formatWon(r.price)}
                      <span className="text-[11px] text-emerald-700 font-normal ml-1">
                        {unitPriceLabel(r.price, product.unit)}
                      </span>
                    </span>
                  </div>
                  {/* 전일대비 변동·주간평균·조사일 — metadata 있으면 노출 */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-emerald-800">
                    {changePct != null && (
                      <span
                        className={`tabular-nums font-medium ${
                          isUp
                            ? "text-rose-700"
                            : isDown
                              ? "text-blue-700"
                              : "text-emerald-700"
                        }`}
                      >
                        {isUp ? "▲" : isDown ? "▼" : "—"}
                        {Math.abs(changePct).toFixed(1)}%
                        {changeAmount != null &&
                          changeAmount !== 0 &&
                          ` (${formatWon(Math.abs(changeAmount))})`}
                      </span>
                    )}
                    {weeklyAvg != null && weeklyAvg > 0 && (
                      <span className="tabular-nums">
                        주간평균 {formatWon(weeklyAvg)}
                      </span>
                    )}
                    <span className="ml-auto">
                      {updatedDate.toLocaleDateString("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                      })}{" "}
                      조사
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 가격 비교 — 핵심 가치, 헤더 바로 아래로 이동 */}
      {/* 오프라인 매장(시세 제외)/온라인 모두 0건 — 통합 빈 상태 */}
      {offlineRows.length === 0 && onlineRows.length === 0 ? (
        <EmptyState
          illustration="/illustrations/empty-cart.png"
          icon="🏷️"
          title="이 상품은 아직 매장에 등록되지 않았습니다"
          description={
            <>
              {marketRateRows.length > 0 ? (
                <>
                  공공 시세는 위에 표시되지만, 실제 매장 가격은 아직 없어요.
                  <br />
                </>
              ) : null}
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
                ({onlineRows.length}개 몰, 낮은 순
                {onlineHiddenCount > 0 && ` · 호가성 ${onlineHiddenCount}건 자동 제외`})
              </span>
            </h2>
            <PriceListClient
              showFavoriteFilter={false}
              unit={product.unit}
              rows={onlineRows}
              emptyHint={
                onlineHiddenCount > 0 ? (
                  <>
                    온라인몰 가격 {onlineHiddenCount}건이 자동 제외됐어요.
                    <br />
                    <span className="text-[11px] text-ink-3">
                      옥션·G마켓 호가성 가격 + 마이너 셀러(단위 검증 안 됨)는 비교 신뢰도가 낮아 제외
                    </span>
                  </>
                ) : (
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
                )
              }
            />
          </section>
        </>
      )}

      {/* 데이터 있는 부가 정보 패널 — details 밖에 직접 노출 (자체적으로 빈 데이터면 숨김)
          식약처 등록 정보 / 영양 정보 / 원재료 정보가 채워진 product에서는
          사용자가 클릭하지 않아도 즉시 보이도록 — "정보 풍부함"을 직관적으로 전달 */}
      <FoodSafetyPanel data={product.metadata} />
      <NutritionPanel productId={product.id} hideIfEmpty />
      {product.category !== "농수산물" && (
        <IngredientsPanel productId={product.id} hideIfEmpty />
      )}

      {/* 추가 이력추적 정보 — details 안에 정리 (펼쳐야 보임)
          농수산물 이력·쇠고기·수산물·건강기능식품은 일부 카테고리만 해당하고
          자체 미노출 처리되니 details에 묶어 헤더 노이즈 방지 */}
      <details className="group">
        <summary className="cursor-pointer p-4 bg-white border border-line rounded-xl font-semibold text-ink-1 flex items-center justify-between hover:bg-surface-muted">
          <span>📋 이력추적 · 인증 (농산물 · 쇠고기 · 수산물 · 건강기능식품)</span>
          <span className="text-ink-3 transition-transform group-open:rotate-180">
            ▼
          </span>
        </summary>
        <div className="mt-3 space-y-6">
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
  subValue,
  highlight,
}: {
  label: string;
  value: string;
  subValue?: string | null;
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
      {subValue && (
        <div
          className={`text-[10px] mt-0.5 tabular-nums ${
            highlight ? "text-brand-600/70" : "text-ink-3"
          }`}
        >
          {subValue}
        </div>
      )}
    </div>
  );
}
