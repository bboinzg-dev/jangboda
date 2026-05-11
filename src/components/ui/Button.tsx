import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
};

// 디자인 시안 그대로 — sm(36h) / md(44h hit) / lg(52h 시니어친화).
// primary는 오렌지, soft는 brand-soft 배경에 brand-ink 텍스트(즉시 보상 강조).
const variantClass: Record<Variant, string> = {
  primary:
    "bg-brand-500 text-white border border-brand-500 hover:bg-brand-600 active:bg-brand-700 shadow-soft hover:shadow-raise",
  secondary:
    "bg-surface text-ink-1 border border-line-strong hover:bg-surface-muted",
  ghost:
    "bg-transparent text-ink-2 border border-transparent hover:bg-surface-muted",
  danger:
    "bg-danger text-white border border-danger hover:opacity-90",
  soft:
    "bg-brand-soft text-brand-ink border border-transparent hover:brightness-95",
};

const sizeClass: Record<Size, string> = {
  sm: "min-h-[36px] px-3 py-2 text-[13px] gap-1.5 rounded-[10px]",
  md: "min-h-[44px] px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "min-h-[52px] px-5 py-3.5 text-[15px] gap-2.5 rounded-2xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    icon,
    iconRight,
    fullWidth,
    className = "",
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        "inline-flex items-center justify-center font-semibold tracking-tight",
        "transition disabled:opacity-50 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1",
        variantClass[variant],
        sizeClass[size],
        fullWidth ? "w-full" : "",
        className,
      ].join(" ")}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
});
