"use client";

import { useState } from "react";
import { formatWon, formatRelativeDate, freshnessTag } from "@/lib/format";
import { unitPriceLabel, unitPriceValue } from "@/lib/units";
import SourceBadge from "@/components/SourceBadge";
import TrustBadge from "@/components/TrustBadge";
import DirectionsButton from "@/components/DirectionsButton";
import FavoriteToggle from "@/components/FavoriteToggle";
import { useFavorites } from "@/components/FavoritesProvider";
import CollapsibleList from "@/components/CollapsibleList";

type TrustInfo = {
  count: number;
  latestDate: Date | string;
};

export type PriceRowData = {
  priceId: string;
  storeId: string;
  storeName: string;
  chainName: string;
  lat: number;
  lng: number;
  price: number;
  updatedAt: Date | string;
  source: string;
  productUrl?: string | null; // 온라인 가격일 때 외부 구매 링크
  online: boolean;
  trust?: TrustInfo;
};

type Props = {
  rows: PriceRowData[];
  unit: string;
  emptyHint: React.ReactNode;
  /** 즐겨찾기 필터 토글 표시 여부 */
  showFavoriteFilter?: boolean;
};

export default function PriceListClient({
  rows,
  unit,
  emptyHint,
  showFavoriteFilter = true,
}: Props) {
  const { authed, ids: favoriteIds } = useFavorites();
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  // 필터 + 정렬 (즐겨찾기 매장 우선, 그 다음 가격 낮은 순)
  const filtered = favoriteOnly
    ? rows.filter((r) => favoriteIds.has(r.storeId))
    : rows;
  const sortedAll = [...filtered].sort((a, b) => {
    const aFav = favoriteIds.has(a.storeId) ? 1 : 0;
    const bFav = favoriteIds.has(b.storeId) ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav; // 즐겨찾기 우선
    return a.price - b.price;
  });

  // 단가 outlier 분리 — 같은 SKU여도 매장별 패키지가 다른 경우(예: 코스트코 대용량)
  // 비교 정확도 위해 본 리스트에서 빼고 별도 섹션으로 표시.
  // 기준: 단가가 중앙값 × 0.5 ~ × 1.7 범위 밖. row 4개 이상일 때만 적용.
  const withUnitPrice = sortedAll.map((r) => ({
    row: r,
    unitPrice: unitPriceValue(r.price, unit),
  }));
  const validUnitPrices = withUnitPrice
    .map((x) => x.unitPrice)
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  const median =
    validUnitPrices.length >= 4
      ? validUnitPrices[Math.floor(validUnitPrices.length / 2)]
      : null;
  const lowBound = median !== null ? median * 0.5 : null;
  const highBound = median !== null ? median * 1.7 : null;

  const sorted = withUnitPrice
    .filter(
      (x) =>
        median === null ||
        x.unitPrice === null ||
        (x.unitPrice >= (lowBound as number) && x.unitPrice <= (highBound as number))
    )
    .map((x) => x.row);
  const outliers = withUnitPrice
    .filter(
      (x) =>
        median !== null &&
        x.unitPrice !== null &&
        (x.unitPrice < (lowBound as number) || x.unitPrice > (highBound as number))
    )
    .map((x) => x.row);

  const minPrice = sorted[0]?.price ?? 0;

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-border rounded-lg p-6 text-center text-stone-500 text-sm">
        {emptyHint}
      </div>
    );
  }

  return (
    <div>
      {showFavoriteFilter && authed && favoriteIds.size > 0 && (
        <label className="inline-flex items-center gap-1.5 mb-2 text-xs text-stone-600 cursor-pointer">
          <input
            type="checkbox"
            checked={favoriteOnly}
            onChange={(e) => setFavoriteOnly(e.target.checked)}
            className="cursor-pointer"
          />
          ★ 즐겨찾기 매장만 ({favoriteIds.size})
        </label>
      )}

      {sorted.length === 0 ? (
        <div className="bg-white border border-border rounded-lg p-4 text-center text-stone-500 text-sm">
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
            return (
              <li
                key={p.storeId}
                className={`bg-white border rounded-lg p-4 flex items-center justify-between ${
                  i === 0
                    ? "border-brand-400 bg-brand-50/30"
                    : isFav
                    ? "border-amber-200 bg-amber-50/30"
                    : "border-border"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {i === 0 && (
                    <span className="bg-brand-500 text-white text-xs px-2 py-0.5 rounded-full shrink-0">
                      최저가
                    </span>
                  )}
                  {!p.online && (
                    <FavoriteToggle storeId={p.storeId} size="sm" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{p.chainName}</div>
                    <div className="text-xs text-stone-500 truncate">
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
                          <a
                            href={p.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium"
                          >
                            <span aria-hidden>🛒</span>
                            <span>구매하러 가기</span>
                            <span aria-hidden>↗</span>
                          </a>
                        )}
                        <span
                          className="text-[10px] text-stone-500"
                          title="온라인 가격은 배송비/묶음 수량에 따라 실제 부담이 다를 수 있어요"
                        >
                          📦 배송비 별도
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-lg font-bold text-stone-900">
                    {formatWon(p.price)}
                  </div>
                  {(() => {
                    const upl = unitPriceLabel(p.price, unit);
                    return upl ? (
                      <div className="text-[11px] text-stone-500 -mt-0.5">
                        {upl}
                      </div>
                    ) : null;
                  })()}
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
                    <span className="text-xs text-stone-500">
                      {formatRelativeDate(p.updatedAt)}
                    </span>
                    {savingsPct > 0 && (
                      <span className="text-xs text-rose-500">
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

      {outliers.length > 0 && (
        <details className="mt-3 border border-warning-soft bg-warning-soft/50 rounded-lg">
          <summary className="cursor-pointer p-3 text-xs text-warning-text font-medium select-none">
            ⚠️ 패키지가 다를 가능성이 있는 가격 {outliers.length}건 (펼쳐 보기)
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
                  className="flex items-center justify-between gap-2 bg-white border border-warning-soft rounded p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-stone-700 truncate">
                      {p.chainName} · {p.storeName}
                    </div>
                    <div className="text-[10px] text-stone-500 mt-0.5">
                      {unitPriceLabel(p.price, unit) ?? "단가 계산 불가"}
                      {" · "}
                      {tag.label} · {formatRelativeDate(p.updatedAt)}
                    </div>
                  </div>
                  <div className="text-base font-bold text-stone-700 shrink-0">
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
