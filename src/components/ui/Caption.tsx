import type { ReactNode } from "react";

// 모노 small caps — 디자인 시안의 섹션 라벨/카테고리 캡션 통일 톤
export function Caption({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        "font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
