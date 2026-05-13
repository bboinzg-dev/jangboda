"use client";

import { useState } from "react";
import { formatWon, formatRelativeDate, freshnessTag } from "@/lib/format";
import { unitPriceLabel, unitPriceParts, unitPriceValue } from "@/lib/units";
import SourceBadge from "@/components/SourceBadge";
import TrustBadge from "@/components/TrustBadge";
import DirectionsButton from "@/components/DirectionsButton";
import FavoriteToggle from "@/components/FavoriteToggle";
import { useFavorites } from "@/components/FavoritesProvider";
import CollapsibleList from "@/components/CollapsibleList";
import ChainLogo from "@/components/ChainLogo";
import TrackedLink from "@/components/TrackedLink";
import { isOnlineOnlyChain } from "@/lib/onlineMalls";

type TrustInfo = {
  count: number;
  latestDate: Date | string;
};

export type PriceRowData = {
  priceId: string;
  storeId: string;
  storeName: string;
  chainName: string;
  chainLogoUrl?: string | null; // chain.logoUrl — 옵셔널 (호출자가 안 주면 미표시)
  lat: number;
  lng: number;
  price: number;                       // 통계·정렬용 가격 — 정책상 listPrice (정가) 기준
  listPrice?: number | null;           // 정가 (= price와 동일하지만 명시)
  paidPrice?: number | null;           // 행사가 (할인 적용 후 단가) — 보조 표시 전용, 통계엔 안 들어감
  promotionType?: string | null;       // "할인" | "1+1" | "번들 50%" 등
  updatedAt: Date | string;
  source: string;
  productUrl?: string | null; // 온라인 가격일 때 외부 구매 링크
  online: boolean;
  trust?: TrustInfo;
  // KAMIS 시세 metadata — { changePct, changeAmount, previousPrice, weeklyAverage }
  // 시세 박스에서 "전일대비 +0.36%" "주간평균 7,006원" 같은 정보 표시용
  metadata?: Record<string, unknown> | null;
};

// 행사가 freshness — 영수증 등록 후 14일 이내만 "최근 행사" 표시
// 행사 만료일을 알 수 없는 데이터의 신선도 한계 (정책 결정)
const PROMO_FRESH_DAYS = 14;
function isPromoFresh(updatedAt: Date | string): boolean {
  const t = typeof updatedAt === "string" ? new Date(updatedAt).getTime() : updatedAt.getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < PROMO_FRESH_DAYS * 24 * 60 * 60 * 1000;
}

type Props = {
  rows: PriceRowData[];
  unit: string;
  emptyHint: React.ReactNode;
  /** 즐겨찾기 필터 토글 표시 여부 */
  showFavoriteFilter?: boolean;
};

type StoreSortBy = "unit" | "price" | "promo";

export default function PriceListClient({
  rows,
  unit,
  emptyHint,
  showFavoriteFilter = true,
}: Props) {
  const { authed, ids: favoriteIds } = useFavorites();
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  // 단가 파싱이 가능하면 단가순 디폴트, 아니면 가격순으로 자동 fallback
  const canCompareUnit = unitPriceValue(1, unit) !== null;
  const [sortBy, setSortBy] = useState<StoreSortBy>(
    canCompareUnit ? "unit" : "price"
  );

  // 행사가가 freshness 14일 이내면 그 가격, 아니면 listPrice 사용 (행사가순 정렬용)
  const effectivePrice = (p: PriceRowData): number => {
    if (
      p.paidPrice != null &&
      p.paidPrice < p.price &&
      isPromoFresh(p.updatedAt)
    ) {
      return p.paidPrice;
    }
    return p.price;
  };

  // 필터 + 정렬 — 사용자가 선택한 정렬 기준만 사용 (단가/가격/행사가)
  // 즐겨찾기 우선 정렬은 제거 — 모든 정렬 모드가 같은 결과 되는 문제 해결
  // 즐겨찾기 매장은 amber 테두리 + ★ 아이콘으로 시각 구분
  // 즐겨찾기만 보고 싶으면 "★ 즐겨찾기 매장만" 체크박스 활용
  const filtered = favoriteOnly
    ? rows.filter((r) => favoriteIds.has(r.storeId))
    : rows;
  const sortedAll = [...filtered].sort((a, b) => {
    if (sortBy === "unit") {
      const ua = unitPriceValue(a.price, unit);
      const ub = unitPriceValue(b.price, unit);
      if (ua === null && ub === null) return a.price - b.price;
      if (ua === null) return 1;
      if (ub === null) return -1;
      return ua - ub;
    }
    if (sortBy === "promo") {
      // 행사가 적용된 매장이 자연스럽게 위로 (effectivePrice 작아서)
      return effectivePrice(a) - effectivePrice(b);
    }
    return a.price - b.price;
  });

  // outlier 분리 — 단가(unit) 기반 우선, 못 파싱하면 가격 median 기반 fallback
  // 비교 정확도 위해 본 리스트에서 빼고 별도 섹션으로 표시.
  // 양배추 15kg 박스 vs 양배추 1포기 같은 케이스 + naver 호가 둘 다 잡아냄
  const withUnitPrice = sortedAll.map((r) => ({
    row: r,
    unitPrice: unitPriceValue(r.price, unit),
  }));
  const validUnitPrices = withUnitPrice
    .map((x) => x.unitPrice)
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  const median =
    validUnitPrices.length >= 3
      ? validUnitPrices[Math.floor(validUnitPrices.length / 2)]
      : null;
  // unit 파싱 실패 시 가격 자체 median fallback (1포기/1통/1마리 등)
  const validRawPrices = sortedAll
    .map((r) => r.price)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const priceMedian =
    validRawPrices.length >= 3
      ? validRawPrices[Math.floor(validRawPrices.length / 2)]
      : null;

  // outlier 판정 — source 신뢰도 기반 (가격으로 자르지 않음)
  // - parsa/kamis/stats_official/receipt/manual/seed/csv = 검증 → outlier 적용 X (백화점 정상가 보존)
  // - naver(호가성) 또는 ONLINE_ONLY_CHAINS = 호가 가능성 → median 기준 컷
  // bound 비대칭: low=×0.3 (정상 저가 관대), high=×1.5 (호가 적극 컷)
  const NOISY_SOURCES = new Set(["naver"]);
  const LOW_RATIO = 0.3;
  const HIGH_RATIO = 1.5;
  const isRowOutlier = (
    price: number,
    up: number | null,
    source: string,
    chainName: string,
  ): boolean => {
    // 신뢰 source는 통과
    if (!NOISY_SOURCES.has(source) && !isOnlineOnlyChain(chainName)) return false;
    if (median !== null && up !== null) {
      return up < median * LOW_RATIO || up > median * HIGH_RATIO;
    }
    if (priceMedian !== null) {
      return price < priceMedian * LOW_RATIO || price > priceMedian * HIGH_RATIO;
    }
    return false;
  };

  const sorted = withUnitPrice
    .filter((x) => !isRowOutlier(x.row.price, x.unitPrice, x.row.source, x.row.chainName))
    .map((x) => x.row);
  const allOutliers = withUnitPrice
    .filter((x) => isRowOutlier(x.row.price, x.unitPrice, x.row.source, x.row.chainName))
    .map((x) => x.row);
  // 온라인 전용 chain(쿠팡/옥션/G마켓/네이버쇼핑/기타 온라인몰 등)의 outlier는
  // 패키지 차이가 아니라 호가성 등록일 가능성 큼 — 보조 섹션에서도 hide.
  // 이마트/롯데마트 등 오프라인 chain의 outlier는 대용량/박스 가능성 → details에 보존.
  const outliers = allOutliers.filter((p) => !isOnlineOnlyChain(p.chainName));
  const hiddenOutlierCount = allOutliers.length - outliers.length;

  // 최저가는 정렬 순서가 아니라 실제 가격 최소값 — 즐겨찾기 우선 정렬과 무관해야 함
  // (이전 버그: 즐겨찾기 매장이 1위로 정렬되면 "최저가" 배지가 잘못 부여됨)
  const minPrice = sorted.length > 0 ? Math.min(...sorted.map((p) => p.price)) : 0;

  if (rows.length === 0) {
    return (
      <div className="card p-6 text-center text-ink-3 text-sm">
        {emptyHint}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        {showFavoriteFilter && authed && favoriteIds.size > 0 ? (
          <label className="inline-flex items-center gap-1.5 text-xs text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={favoriteOnly}
              onChange={(e) => setFavoriteOnly(e.target.checked)}
              className="cursor-pointer"
            />
            ★ 즐겨찾기 매장만 ({favoriteIds.size})
          </label>
        ) : (
          <span />
        )}
        {/* 정렬 토글 — 행사가순은 모든 상품에서 의미 있어 단가 비교 불가 케이스에도 노출 */}
        <div className="inline-flex items-center gap-1 text-xs">
          <span className="text-ink-3">정렬:</span>
          {canCompareUnit && (
            <button
              onClick={() => setSortBy("unit")}
              className={`px-2.5 py-1.5 rounded-lg ${
                sortBy === "unit"
                  ? "bg-brand-soft text-brand-700 font-medium"
                  : "text-ink-2 hover:bg-surface-muted"
              }`}
              title="단위가격(100g당, 1L당 등)으로 비교"
            >
              단가순
            </button>
          )}
          <button
            onClick={() => setSortBy("price")}
            className={`px-2.5 py-1.5 rounded-lg ${
              sortBy === "price"
                ? "bg-brand-soft text-brand-700 font-medium"
                : "text-ink-2 hover:bg-surface-muted"
            }`}
          >
            가격순
          </button>
          <button
            onClick={() => setSortBy("promo")}
            className={`px-2.5 py-1.5 rounded-lg ${
              sortBy === "promo"
                ? "bg-danger-soft text-danger-text font-medium"
                : "text-ink-2 hover:bg-surface-muted"
            }`}
            title="최근 14일 내 행사가 적용된 매장 우선 정렬"
          >
            🎉 행사가순
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="card p-4 text-center text-ink-3 text-sm">
          즐겨찾기 매장에는 이 상품이 등록되지 않았습니다
        </div>
      ) : (
        <CollapsibleList initialCount={5} as="ul" innerClassName="space-y-2">
          {sorted.map((p, i) => {
            const tag = freshnessTag(p.updatedAt);
            const savingsPct =
              p.price > minPrice
                ? Math.round(((p.price - minPrice) / minPrice) * 100)
                : 0;
            const showDirections = !p.online && p.lat > 0 && p.lng > 0;
            const isFav = favoriteIds.has(p.storeId);
            // "최저가" 배지·테두리는 실제 최소 가격 매장에만 (정렬 순서와 무관)
            const isLowest = p.price === minPrice && minPrice > 0;
            return (
              <li
                key={p.storeId}
                className={`card p-4 flex items-center justify-between gap-3 ${
                  isLowest
                    ? "border-l-4 border-l-brand-500 bg-brand-soft/30"
                    : isFav
                    ? "border-warning/30 bg-warning-soft/30"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isLowest && (
                    <span className="bg-brand-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0">
                      최저가
                    </span>
                  )}
                  {!p.online && (
                    <FavoriteToggle storeId={p.storeId} size="sm" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[15px] text-ink-1 flex items-center gap-1.5 min-w-0">
                      <ChainLogo
                        src={p.chainLogoUrl}
                        name={p.chainName}
                        size={20}
                      />
                      {/* 체인명은 truncate, 매장명은 다음 줄(아래)이라 두 정보가 동시에 잘리지 않도록 분리 */}
                      <span className="truncate min-w-0">{p.chainName}</span>
                    </div>
                    <div className="text-xs text-ink-3 line-clamp-1 mt-0.5">
                      {p.storeName}
                    </div>
                    {showDirections && (
                      <div className="mt-1.5">
                        <DirectionsButton
                          name={p.storeName}
                          lat={p.lat}
                          lng={p.lng}
                        />
                      </div>
                    )}
                    {p.online && (
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        {p.productUrl && (
                          <TrackedLink
                            href={p.productUrl}
                            kind="product_buy"
                            id={p.priceId}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-success/30 bg-success-soft hover:bg-success-soft text-success-text font-medium"
                          >
                            <span aria-hidden>🛒</span>
                            <span>구매하러 가기</span>
                            <span aria-hidden>↗</span>
                          </TrackedLink>
                        )}
                        <span
                          className="text-[10px] text-ink-3"
                          title="온라인 가격은 배송비/묶음 수량에 따라 실제 부담이 다를 수 있어요"
                        >
                          📦 배송비 별도
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  {(() => {
                    const uparts = unitPriceParts(p.price, unit);
                    // 실판매가를 메인 — 품목명에 이미 용량(1.5L 등)이 포함되어 있어
                    // 사용자가 가장 먼저 알고 싶은 건 "이 매장에서 사면 얼마"
                    return (
                      <>
                        <div className="text-[22px] font-extrabold tabular-nums tracking-tight text-ink-1 leading-tight">
                          {formatWon(p.price)}
                        </div>
                        {uparts && (
                          <div className="text-[11px] text-ink-3 tabular-nums leading-none mt-0.5">
                            {uparts.basis} {uparts.amount}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {/* 최근 행사가 — paidPrice가 listPrice보다 작고 14일 이내 등록된 경우만 표시
                      "이 매장은 가끔 할인 행사도 한다" 신호 — 사용자가 행사 빈도 감 잡게.
                      행사 만료를 알 수 없어 14일 freshness 컷오프 적용. 통계에는 미포함. */}
                  {p.paidPrice != null &&
                    p.paidPrice < p.price &&
                    isPromoFresh(p.updatedAt) && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-danger-text bg-danger-soft border border-danger/30 rounded px-1.5 py-0.5 font-medium">
                        🎉 최근 행사가 {formatWon(p.paidPrice)}
                        {p.promotionType ? ` · ${p.promotionType}` : ""}
                      </div>
                    )}
                  <div className="flex items-center gap-1 justify-end mt-0.5 flex-wrap">
                    <SourceBadge source={p.source} />
                    {p.trust && (
                      <TrustBadge
                        count={p.trust.count}
                        latestDate={p.trust.latestDate}
                        source={p.source}
                      />
                    )}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${tag.color}`}
                    >
                      {tag.label}
                    </span>
                    <span className="text-xs text-ink-3">
                      {formatRelativeDate(p.updatedAt)}
                    </span>
                    {savingsPct > 0 && (
                      <span className="text-xs text-danger">
                        +{savingsPct}%
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </CollapsibleList>
      )}

      {hiddenOutlierCount > 0 && outliers.length === 0 && (
        <div className="mt-2 text-[11px] text-ink-3 text-center">
          온라인몰 호가성 {hiddenOutlierCount}건은 자동 제외됨
        </div>
      )}
      {outliers.length > 0 && (
        <details className="mt-3 border border-warning-soft bg-warning-soft/50 rounded-xl">
          <summary className="cursor-pointer p-3 text-xs text-warning-text font-medium select-none">
            ⚠️ 패키지가 다를 가능성이 있는 가격 {outliers.length}건 (펼쳐 보기)
            {hiddenOutlierCount > 0 && (
              <span className="ml-2 text-warning-text/70 font-normal">
                · 온라인몰 호가성 {hiddenOutlierCount}건 자동 제외
              </span>
            )}
          </summary>
          <div className="px-3 pb-3 text-[11px] text-warning-text/80 mb-1">
            같은 상품으로 등록됐지만 단가가 다른 매장과 크게 다릅니다.
            대용량/소포장 등 포장 단위 차이일 수 있어 비교 목록에서 분리했습니다.
          </div>
          <ul className="space-y-1.5 px-3 pb-3 opacity-75">
            {outliers.map((p) => {
              const tag = freshnessTag(p.updatedAt);
              return (
                <li
                  key={p.priceId}
                  className="flex items-center justify-between gap-2 bg-surface border border-warning-soft rounded p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink-2 truncate flex items-center gap-1.5">
                      <ChainLogo
                        src={p.chainLogoUrl}
                        name={p.chainName}
                        size={16}
                      />
                      <span className="truncate">
                        {p.chainName} · {p.storeName}
                      </span>
                    </div>
                    <div className="text-[10px] text-ink-3 mt-0.5">
                      {unitPriceLabel(p.price, unit) ?? "단가 계산 불가"}
                      {" · "}
                      {tag.label} · {formatRelativeDate(p.updatedAt)}
                    </div>
                  </div>
                  <div className="text-base font-bold text-ink-2 shrink-0">
                    {formatWon(p.price)}
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
