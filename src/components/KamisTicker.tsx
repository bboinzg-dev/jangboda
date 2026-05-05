"use client";

import Link from "next/link";
import ProductImage from "./ProductImage";
import { unitPriceLabel } from "@/lib/units";

type TickerItem = {
  id: string;
  productId: string;
  productName: string;
  productUnit: string;
  productImageUrl?: string | null;
  price: number;
  /** 전 조사일 대비 변동 금액 (없으면 표시 안 함) */
  changeAmount?: number | null;
  /** 전 조사일 대비 변동 퍼센트 */
  changePct?: number | null;
};

type Props = {
  items: TickerItem[];
};

// 홈 "오늘의 시세" 위젯 — 카드들이 위로 자동 흐르는 ticker
// - 모든 KAMIS 시세 노출 (4 cards visible viewport, 자동 vertical scroll)
// - 마우스 오버 시 일시정지
// - "전체 보기" 링크로 /kamis 페이지 이동
// - 데이터 부족(< 5개)이면 ticker 효과 없이 grid로 노출
export default function KamisTicker({ items }: Props) {
  if (items.length === 0) return null;

  // 5개 미만이면 흐름 효과 의미 없음 — 정적 grid
  if (items.length < 5) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {items.map((p) => (
          <ItemCard key={p.id} item={p} />
        ))}
      </div>
    );
  }

  // 카드 한 그룹의 높이를 기반으로 애니메이션 길이 계산 — 카드당 4초
  const duration = `${Math.max(20, items.length * 4)}s`;

  return (
    <div
      className="ticker-container relative h-[280px] md:h-[200px] overflow-hidden rounded-lg border border-border bg-white"
      style={{ ["--ticker-duration" as string]: duration }}
    >
      {/* 위/아래 페이드 그라데이션 — 흐름의 시작/끝을 부드럽게 */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white to-transparent z-10" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent z-10" />

      {/* ticker track — 콘텐츠 두 번 복제로 끊김 없는 무한 loop */}
      <div className="ticker-track flex flex-col gap-2 p-2">
        {[...items, ...items].map((p, idx) => (
          <ItemCard key={`${p.id}-${idx}`} item={p} />
        ))}
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: TickerItem }) {
  const change = item.changeAmount ?? null;
  const pct = item.changePct ?? null;
  // 변동 색: 상승=red, 하락=blue (한국 관습), 동일=gray
  const isUp = change !== null && change > 0;
  const isDown = change !== null && change < 0;
  const colorClass = isUp
    ? "text-rose-600"
    : isDown
    ? "text-blue-600"
    : "text-stone-400";
  return (
    <Link
      href={`/products/${item.productId}`}
      className="flex items-center gap-2 px-3 py-2 bg-stone-50 hover:bg-brand-50 border border-border rounded-md transition"
    >
      <ProductImage
        src={item.productImageUrl}
        alt={item.productName}
        size={36}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-stone-900 truncate">
          {item.productName}
        </div>
        <div className="text-[10px] text-stone-500 truncate">
          {item.productUnit}
        </div>
      </div>
      <div className="shrink-0 ml-1 text-right">
        {/* 실판매가가 메인 — 사용자가 실제 지불할 금액. 단가는 보조 비교용 */}
        <div className="text-sm font-bold text-brand-700 tabular-nums">
          {item.price.toLocaleString("ko-KR")}원
        </div>
        {/* 부가 표시: 용량당 가격 — 실판매가 아래 작게 (10kg쌀이면 "100g당 689원") */}
        {(() => {
          const upl = unitPriceLabel(item.price, item.productUnit);
          if (!upl) return null;
          return (
            <div className="text-[11px] text-stone-500 tabular-nums">
              {upl}
            </div>
          );
        })()}
        {change !== null && pct !== null && (
          <div className={`text-[10px] font-medium ${colorClass}`}>
            {isUp ? "▲" : isDown ? "▼" : "—"}{" "}
            {Math.abs(change).toLocaleString("ko-KR")}원
            <span className="ml-1 opacity-80">
              ({pct >= 0 ? "+" : ""}
              {pct.toFixed(1)}%)
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
