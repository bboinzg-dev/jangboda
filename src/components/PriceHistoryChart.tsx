import type { CSSProperties } from "react";
import { formatWon } from "@/lib/format";

type Point = { date: Date | string; price: number; chainName: string };

type Props = {
  history: Point[];
  /** 데스크톱(md+) 기준 차트 높이 (기본 240) */
  height?: number;
  /** 모바일(<md) 차트 높이 (기본 180) */
  mobileHeight?: number;
};

// 매장별 색상 팔레트 (탭/홀썸한 색)
const COLORS = [
  "#ef4444", // rose
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

function toDate(x: Date | string): Date {
  return typeof x === "string" ? new Date(x) : x;
}

function formatShortDate(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

export default function PriceHistoryChart({
  history,
  height = 240,
  mobileHeight = 180,
}: Props) {
  // 데이터 1건 이하면 안내 — 모바일에선 mobileHeight 사용
  if (!history || history.length <= 1) {
    return (
      <div
        className="bg-white border border-border rounded-lg flex items-center justify-center text-sm text-stone-500 h-[var(--ch-m)] md:h-[var(--ch-d)]"
        style={
          {
            ["--ch-m" as string]: `${mobileHeight}px`,
            ["--ch-d" as string]: `${height}px`,
          } as CSSProperties
        }
      >
        추이 데이터 부족
      </div>
    );
  }

  // 정규화 + 정렬
  const points = history
    .map((p) => ({
      date: toDate(p.date),
      price: p.price,
      chainName: p.chainName,
    }))
    .filter((p) => !isNaN(p.date.getTime()) && p.price > 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (points.length <= 1) {
    return (
      <div
        className="bg-white border border-border rounded-lg flex items-center justify-center text-sm text-stone-500 h-[var(--ch-m)] md:h-[var(--ch-d)]"
        style={
          {
            ["--ch-m" as string]: `${mobileHeight}px`,
            ["--ch-d" as string]: `${height}px`,
          } as CSSProperties
        }
      >
        추이 데이터 부족
      </div>
    );
  }

  // 매장별 그룹핑
  const chainsMap = new Map<string, typeof points>();
  for (const p of points) {
    const arr = chainsMap.get(p.chainName) ?? [];
    arr.push(p);
    chainsMap.set(p.chainName, arr);
  }
  const chains = Array.from(chainsMap.entries()).map(([name, pts], idx) => ({
    name,
    color: COLORS[idx % COLORS.length],
    points: pts,
  }));

  // 좌표 계산
  const minTime = Math.min(...points.map((p) => p.date.getTime()));
  const maxTime = Math.max(...points.map((p) => p.date.getTime()));
  const minPrice = Math.min(...points.map((p) => p.price));
  const maxPrice = Math.max(...points.map((p) => p.price));

  const timeRange = Math.max(1, maxTime - minTime);
  const priceRange = Math.max(1, maxPrice - minPrice);
  // 가격 영역 패딩 (위/아래 10%)
  const padPrice = priceRange * 0.1;
  const yMin = Math.max(0, minPrice - padPrice);
  const yMax = maxPrice + padPrice;
  const yRange = Math.max(1, yMax - yMin);

  // SVG 사이즈 — viewBox 사용으로 반응형
  const W = 600;
  const H = height;
  const padL = 56; // y축 라벨 공간
  const padR = 16;
  const padT = 12;
  const padB = 36; // x축 라벨 공간
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  function xOf(t: number): number {
    return padL + ((t - minTime) / timeRange) * innerW;
  }
  function yOf(p: number): number {
    return padT + (1 - (p - yMin) / yRange) * innerH;
  }

  // y축 눈금 4개 (균등)
  const yTicks = [0, 1, 2, 3, 4].map((i) => yMin + (yRange * i) / 4);

  // x축 라벨 — 첫/중간/마지막 정도
  const xTickIndices = points.length <= 4
    ? points.map((_, i) => i)
    : [0, Math.floor(points.length / 3), Math.floor((points.length * 2) / 3), points.length - 1];
  const xTickPoints = Array.from(new Set(xTickIndices)).map((i) => points[i]);

  return (
    <div className="bg-white border border-border rounded-lg p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        preserveAspectRatio="none"
        role="img"
        aria-label="가격 추이 그래프"
        className="h-[var(--ch-m)] md:h-[var(--ch-d)] block"
        style={
          {
            ["--ch-m" as string]: `${mobileHeight}px`,
            ["--ch-d" as string]: `${H}px`,
          } as CSSProperties
        }
      >
        {/* y축 눈금선 + 라벨 */}
        {yTicks.map((tv, i) => {
          const y = yOf(tv);
          return (
            <g key={`y-${i}`}>
              <line
                x1={padL}
                y1={y}
                x2={W - padR}
                y2={y}
                stroke="#e7e5e4"
                strokeWidth={1}
              />
              <text
                x={padL - 6}
                y={y + 4}
                fontSize="11"
                textAnchor="end"
                fill="#78716c"
              >
                {formatWon(Math.round(tv))}
              </text>
            </g>
          );
        })}

        {/* x축 라벨 */}
        {xTickPoints.map((p, i) => {
          const x = xOf(p.date.getTime());
          return (
            <text
              key={`x-${i}`}
              x={x}
              y={H - padB + 18}
              fontSize="11"
              textAnchor="middle"
              fill="#78716c"
            >
              {formatShortDate(p.date)}
            </text>
          );
        })}

        {/* x축 베이스 라인 */}
        <line
          x1={padL}
          y1={H - padB}
          x2={W - padR}
          y2={H - padB}
          stroke="#d6d3d1"
          strokeWidth={1}
        />

        {/* 매장별 line + dot */}
        {chains.map((c) => {
          const sortedPts = [...c.points].sort(
            (a, b) => a.date.getTime() - b.date.getTime()
          );
          const path = sortedPts
            .map((p, idx) => {
              const x = xOf(p.date.getTime());
              const y = yOf(p.price);
              return `${idx === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
            })
            .join(" ");
          return (
            <g key={c.name}>
              {sortedPts.length > 1 && (
                <path
                  d={path}
                  fill="none"
                  stroke={c.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {sortedPts.map((p, idx) => (
                <circle
                  key={idx}
                  cx={xOf(p.date.getTime())}
                  cy={yOf(p.price)}
                  r={3.5}
                  fill={c.color}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {chains.map((c) => (
          <div key={c.name} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: c.color }}
              aria-hidden
            />
            <span className="text-stone-700">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
