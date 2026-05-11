// 통화/숫자 셀 — 항상 tabular-nums + 한국식 천단위 콤마.
// formatWon과 다른 점: 사이즈/색 props로 인라인 표시에 바로 쓸 수 있음.

type NumProps = {
  value: number | string;
  currency?: string | null;
  size?: number;
  weight?: 400 | 500 | 600 | 700 | 800;
  color?: string;
  className?: string;
};

export function Num({
  value,
  currency = "₩",
  size = 15,
  weight = 600,
  color,
  className = "",
}: NumProps) {
  const display = typeof value === "number"
    ? value.toLocaleString("ko-KR")
    : value;
  return (
    <span
      className={["tabular-nums tracking-tight", className].join(" ")}
      style={{
        fontSize: size,
        fontWeight: weight,
        color,
        fontFeatureSettings: '"tnum"',
      }}
    >
      {currency}
      {display}
    </span>
  );
}
