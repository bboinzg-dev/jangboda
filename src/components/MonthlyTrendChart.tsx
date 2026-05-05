// 월별 지출 추세 라인차트 — recharts 안 쓰고 SVG 직접 (번들 보호)
// 가벼운 6-12개월 라인 + 점 + 호버 title.

import { formatWon } from "@/lib/format";

type Props = {
  data: { key: string; total: number }[];
  currentKey: string;
};

export default function MonthlyTrendChart({ data, currentKey }: Props) {
  if (data.length === 0) return null;
  const w = 600;
  const h = 200;
  const padding = { top: 16, right: 12, bottom: 28, left: 56 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  const max = Math.max(...data.map((d) => d.total), 1);
  const stepX = chartW / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + chartH - (d.total / max) * chartH,
    ...d,
  }));

  // 라인 path
  const linePath = points
    .map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`))
    .join(" ");

  // 영역 fill — 라인 아래 그라데이션
  const lastP = points[points.length - 1];
  const firstP = points[0];
  const fillPath = `${linePath} L${lastP.x},${padding.top + chartH} L${firstP.x},${padding.top + chartH} Z`;

  // y축 그리드 (max, max/2, 0)
  const yTicks = [
    { val: max, label: formatWon(max) },
    { val: max / 2, label: formatWon(Math.round(max / 2)) },
    { val: 0, label: "0" },
  ];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="월별 지출 추세"
    >
      {/* y축 그리드 + 라벨 */}
      {yTicks.map((t) => {
        const y = padding.top + chartH - (t.val / max) * chartH;
        return (
          <g key={t.val}>
            <line
              x1={padding.left}
              y1={y}
              x2={padding.left + chartW}
              y2={y}
              stroke="#f3f4f6"
              strokeDasharray={t.val === 0 ? "" : "2,3"}
            />
            <text
              x={padding.left - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="10"
              fill="#9ca3af"
            >
              {t.label}
            </text>
          </g>
        );
      })}

      {/* 영역 fill */}
      <path d={fillPath} fill="rgba(217, 83, 30, 0.08)" />

      {/* 라인 */}
      <path
        d={linePath}
        stroke="#d9531e"
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* 점 + x축 라벨 */}
      {points.map((p, i) => {
        const isCurrent = p.key === currentKey;
        const month = p.key.split("-")[1];
        return (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={isCurrent ? 5 : 3.5}
              fill={isCurrent ? "#d9531e" : "#fff"}
              stroke="#d9531e"
              strokeWidth={isCurrent ? 2 : 1.5}
            >
              <title>
                {p.key} · {formatWon(p.total)}
              </title>
            </circle>
            <text
              x={p.x}
              y={h - 8}
              textAnchor="middle"
              fontSize="11"
              fill={isCurrent ? "#d9531e" : "#6b7280"}
              fontWeight={isCurrent ? "600" : "400"}
            >
              {parseInt(month, 10)}월
            </text>
          </g>
        );
      })}
    </svg>
  );
}
