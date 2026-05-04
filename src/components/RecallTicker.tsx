"use client";

import Link from "next/link";

type RecallItem = {
  id: string;
  productName: string;
  manufacturer?: string | null;
  reason?: string | null;
  grade?: string | null;
};

type Props = {
  items: RecallItem[];
};

// 회수·판매중지 ticker — KamisTicker 패턴과 동일한 자동 vertical scroll
// 3개 viewport, 마우스오버 일시정지
export default function RecallTicker({ items }: Props) {
  if (items.length === 0) return null;

  // 5개 미만이면 ticker 의미 없음 — 정적 list
  if (items.length < 5) {
    return (
      <ul className="space-y-2">
        {items.map((r) => (
          <ItemCard key={r.id} item={r} />
        ))}
      </ul>
    );
  }

  const duration = `${Math.max(20, items.length * 4)}s`;

  return (
    <div
      className="ticker-container relative h-[280px] md:h-[200px] overflow-hidden rounded-lg border border-danger-soft bg-white"
      style={{ ["--ticker-duration" as string]: duration }}
    >
      <div className="pointer-events-none absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-white to-transparent z-10" />
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent z-10" />
      <div className="ticker-track flex flex-col gap-2 p-2">
        {[...items, ...items].map((r, idx) => (
          <ItemCard key={`${r.id}-${idx}`} item={r} />
        ))}
      </div>
    </div>
  );
}

function ItemCard({ item }: { item: RecallItem }) {
  const gradeClass = (() => {
    const g = item.grade ?? "";
    if (g.includes("1")) return "bg-danger-soft text-danger-text";
    if (g.includes("2")) return "bg-orange-100 text-orange-700";
    if (g.includes("3")) return "bg-warning-soft text-warning-text";
    return "bg-stone-100 text-stone-600";
  })();

  return (
    <Link
      href="/recalls"
      className="block bg-white border border-danger-soft rounded-md px-3 py-2 hover:bg-rose-50 transition"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-ink-1 truncate text-sm">
          {item.productName}
        </span>
        {item.grade && (
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gradeClass}`}
          >
            {item.grade}
          </span>
        )}
      </div>
      {item.manufacturer && (
        <div className="text-[11px] text-ink-3 truncate">{item.manufacturer}</div>
      )}
      {item.reason && (
        <div className="text-[11px] text-danger-text line-clamp-1">
          {item.reason}
        </div>
      )}
    </Link>
  );
}
