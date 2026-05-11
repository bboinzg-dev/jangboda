import type { ReactNode } from "react";
import { Card } from "./Card";
import { Caption } from "./Caption";
import { Num } from "./Num";
import { Sparkline } from "./Sparkline";
import { TrendingIcon, TrendingDownIcon, SparkleIcon } from "./Icons";

type Tone = "success" | "warning" | "danger" | "info" | "brand" | "neutral";

const toneVar: Record<Tone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  brand: "var(--brand)",
  neutral: "var(--ink-2)",
};

const toneText: Record<Tone, string> = {
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
  info: "text-info-text",
  brand: "text-brand-ink",
  neutral: "text-ink-2",
};

type KpiCardProps = {
  label: string;
  value: number | string;
  currency?: string | null;
  note?: string;
  spark?: number[];
  deltaValue?: number | string;
  deltaLabel?: string;
  tone?: Tone;
  hero?: boolean;
  accent?: boolean; // brand 그라데이션 배경
  icon?: ReactNode;
};

// 디자인 시안 KPI 카드 — hero=true면 큰 숫자 + sparkline 옆,
// accent=true면 brand-soft 그라데이션(절약액 강조용).
export function KpiCard({
  label,
  value,
  currency = "₩",
  note,
  spark,
  deltaValue,
  deltaLabel,
  tone = "neutral",
  hero = false,
  accent = false,
  icon,
}: KpiCardProps) {
  const accentBg = accent
    ? {
        background:
          "linear-gradient(135deg, var(--brand-soft) 0%, var(--surface) 100%)",
      }
    : undefined;
  return (
    <Card
      raised={hero}
      className={["relative", hero ? "p-5" : "p-[18px]"].join(" ")}
    >
      <div style={accentBg} className="absolute inset-0 -z-0" />
      <div className="relative z-10">
        <Caption>{label}</Caption>
        <div className="mt-2 flex items-baseline gap-2">
          <Num
            value={value}
            currency={currency}
            size={hero ? 38 : 26}
            weight={800}
            color={accent ? "var(--brand)" : "var(--ink-1)"}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          {note && <div className="text-xs text-ink-3 min-w-0 truncate">{note}</div>}
          {spark && spark.length >= 2 && (
            <Sparkline
              values={spark}
              color={toneVar[tone]}
              width={hero ? 110 : 72}
              height={hero ? 36 : 28}
            />
          )}
        </div>
        {(deltaValue !== undefined || deltaLabel) && (
          <div
            className={[
              "mt-2.5 pt-2.5 border-t border-dashed border-line",
              "text-xs font-semibold flex items-center gap-1",
              toneText[tone],
            ].join(" ")}
          >
            {tone === "success" && <TrendingDownIcon size={13} />}
            {(tone === "danger" || tone === "warning") && <TrendingIcon size={13} />}
            {tone === "brand" && <SparkleIcon size={13} />}
            {icon}
            <span>
              {deltaValue !== undefined && (
                <span className="tabular-nums">{deltaValue}</span>
              )}
              {deltaLabel && (
                <span className="text-ink-3 font-medium ml-1.5">{deltaLabel}</span>
              )}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
