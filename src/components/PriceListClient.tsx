"use client";

import { useState } from "react";
import { formatWon, formatRelativeDate, freshnessTag } from "@/lib/format";
import { unitPriceLabel } from "@/lib/units";
import SourceBadge from "@/components/SourceBadge";
import TrustBadge from "@/components/TrustBadge";
import DirectionsButton from "@/components/DirectionsButton";
import ReportPriceButton from "@/components/ReportPriceButton";
import FavoriteToggle from "@/components/FavoriteToggle";
import { useFavorites } from "@/components/FavoritesProvider";

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
  const sorted = [...filtered].sort((a, b) => {
    const aFav = favoriteIds.has(a.storeId) ? 1 : 0;
    const bFav = favoriteIds.has(b.storeId) ? 1 : 0;
    if (aFav !== bFav) return bFav - aFav; // 즐겨찾기 우선
    return a.price - b.price;
  });

  const minPrice = sorted[0]?.price ?? 0;

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-lg p-6 text-center text-stone-500 text-sm">
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
        <div className="bg-white border border-stone-200 rounded-lg p-4 text-center text-stone-500 text-sm">
          즐겨찾기 매장에는 이 상품이 등록되지 않았습니다
        </div>
      ) : (
        <ul className="space-y-2">
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
                    : "border-stone-200"
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
                    <ReportPriceButton
                      priceId={p.priceId}
                      currentPrice={p.price}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
