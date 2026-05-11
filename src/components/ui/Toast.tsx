import type { ReactNode } from "react";
import { CheckIcon, WarnIcon, InfoIcon } from "./Icons";

type Tone = "success" | "warning" | "info" | "danger";

const toneConfig: Record<Tone, { icon: ReactNode; bg: string; fg: string }> = {
  success: { icon: <CheckIcon size={16} />, bg: "bg-success-soft", fg: "text-success" },
  warning: { icon: <WarnIcon size={16} />, bg: "bg-warning-soft", fg: "text-warning" },
  info: { icon: <InfoIcon size={16} />, bg: "bg-info-soft", fg: "text-info" },
  danger: { icon: <WarnIcon size={16} />, bg: "bg-danger-soft", fg: "text-danger" },
};

export function Toast({
  tone = "success",
  title,
  body,
  action,
  onAction,
}: {
  tone?: Tone;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  const t = toneConfig[tone];
  return (
    <div className="flex gap-3 items-start p-3 bg-surface border border-line-strong rounded-2xl shadow-raise min-w-[320px]">
      <div className={["w-7 h-7 rounded-lg flex items-center justify-center shrink-0", t.bg, t.fg].join(" ")}>
        {t.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink-1">{title}</div>
        {body && <div className="text-xs text-ink-3 mt-0.5">{body}</div>}
      </div>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="text-[13px] font-semibold text-brand-500 hover:text-brand-600 p-1 shrink-0"
        >
          {action}
        </button>
      )}
    </div>
  );
}
