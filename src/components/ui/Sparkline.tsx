type SparklineProps = {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  strokeWidth?: number;
  showDot?: boolean;
};

// 간단한 inline SVG 스파크라인. recharts 안 씀 (번들 보호).
// color는 var(--brand) 같은 CSS 변수 그대로 받음.
export function Sparkline({
  values,
  color = "var(--ink-2)",
  width = 96,
  height = 32,
  strokeWidth = 1.6,
  showDot = true,
}: SparklineProps) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * (height - 4) - 2}`)
    .join(" ");
  const lastX = (values.length - 1) * step;
  const lastY =
    height - ((values[values.length - 1] - min) / range) * (height - 4) - 2;
  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDot && <circle cx={lastX} cy={lastY} r={2.5} fill={color} />}
    </svg>
  );
}
