import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, prefix, suffix, className = "", ...rest },
  ref,
) {
  const hasError = !!error;
  return (
    <label className={["flex flex-col gap-1.5", className].join(" ")}>
      {label && (
        <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      )}
      <span
        className={[
          "inline-flex items-center gap-2 px-3 h-11 bg-surface rounded-xl",
          "border",
          hasError ? "border-danger" : "border-line-strong",
          "focus-within:ring-2 focus-within:ring-brand-400 focus-within:ring-offset-1",
          "transition",
        ].join(" ")}
      >
        {prefix && <span className="text-ink-3 flex shrink-0">{prefix}</span>}
        <input
          ref={ref}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-ink-1 placeholder:text-ink-3/70 font-inherit"
          {...rest}
        />
        {suffix && <span className="text-ink-3 shrink-0">{suffix}</span>}
      </span>
      {(hint || error) && (
        <span
          className={[
            "text-xs",
            hasError ? "text-danger" : "text-ink-3",
          ].join(" ")}
        >
          {error ?? hint}
        </span>
      )}
    </label>
  );
});
