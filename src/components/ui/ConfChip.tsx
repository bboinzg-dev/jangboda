import { CheckIcon, WarnIcon, SparkleIcon } from "./Icons";

// 영수증 신뢰도 3단계 칩 — auto(자동확정) / review(검수) / new(신규).
// 좌상단의 22x22 색 칩. ReceiptRow의 좌측 색 띠와 짝.
type Conf = "auto" | "review" | "new";

const toneConfig: Record<Conf, { bg: string; fg: string; icon: React.ReactNode }> = {
  auto: { bg: "bg-success-soft", fg: "text-success", icon: <CheckIcon size={11} /> },
  review: { bg: "bg-warning-soft", fg: "text-warning", icon: <WarnIcon size={11} /> },
  new: { bg: "bg-info-soft", fg: "text-info", icon: <SparkleIcon size={11} /> },
};

export function ConfChip({ conf }: { conf: Conf }) {
  const t = toneConfig[conf];
  return (
    <span
      className={[
        "w-[22px] h-[22px] rounded-md inline-flex items-center justify-center shrink-0",
        t.bg,
        t.fg,
      ].join(" ")}
      aria-label={conf === "auto" ? "자동 확정" : conf === "review" ? "검수 필요" : "신규 등록"}
    >
      {t.icon}
    </span>
  );
}

export type { Conf };
