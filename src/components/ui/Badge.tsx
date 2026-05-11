import type { ReactNode, HTMLAttributes } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
};

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-2 border border-line",
  success: "bg-success-soft text-success-text border border-transparent",
  warning: "bg-warning-soft text-warning-text border border-transparent",
  danger: "bg-danger-soft text-danger-text border border-transparent",
  info: "bg-info-soft text-info-text border border-transparent",
  brand: "bg-brand-soft text-brand-ink border border-transparent",
};

export function Badge({
  tone = "neutral",
  icon,
  className = "",
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] font-semibold leading-tight",
        toneClass[tone],
        className,
      ].join(" ")}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
