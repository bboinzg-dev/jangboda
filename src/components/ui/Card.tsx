import type { ReactNode, HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  raised?: boolean;
  children: ReactNode;
};

export function Card({
  raised = false,
  className = "",
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        "bg-surface border border-line rounded-2xl overflow-hidden",
        raised ? "shadow-raise" : "shadow-soft",
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
