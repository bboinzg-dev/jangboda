type TabsProps = {
  items: string[];
  active: number;
  onSelect?: (i: number) => void;
  className?: string;
};

// 분절형 탭(segmented control) — 단가/최저가 정렬, 월/주/일 등에 사용.
export function Tabs({ items, active, onSelect, className = "" }: TabsProps) {
  return (
    <div
      className={[
        "inline-flex gap-1 p-1 bg-surface-muted border border-line rounded-xl",
        className,
      ].join(" ")}
      role="tablist"
    >
      {items.map((label, i) => {
        const isActive = i === active;
        return (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect?.(i)}
            className={[
              "flex-1 px-3.5 py-2 rounded-lg text-[13.5px] font-medium tracking-tight transition",
              isActive
                ? "bg-surface text-ink-1 font-semibold shadow-soft"
                : "bg-transparent text-ink-3 hover:text-ink-2",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
