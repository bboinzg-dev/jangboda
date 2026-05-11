type Tone = "brand" | "success" | "warning" | "danger" | "neutral";

const toneClass: Record<Tone, string> = {
  brand: "bg-brand-500",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-ink-4",
};

export function Progress({
  value,
  tone = "brand",
  height = 8,
  showLabel = false,
  className = "",
}: {
  value: number;
  tone?: Tone;
  height?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={["flex flex-col gap-1", className].join(" ")}>
      <div
        className="bg-surface-muted overflow-hidden rounded-full"
        style={{ height }}
      >
        <div
          className={["h-full rounded-full transition-all", toneClass[tone]].join(" ")}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <div className="text-[11px] text-ink-3 font-mono text-right tabular-nums">
          {clamped}%
        </div>
      )}
    </div>
  );
}
