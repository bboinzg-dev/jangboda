import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

// 재사용 가능한 빈 상태(empty state) 카드
// - 큰 이모지 + 타이틀 + 설명 + 1~2개 액션 버튼
// - 다양한 페이지에서 동일한 톤으로 빈 화면을 채우는 용도
export type EmptyStateAction = {
  href: string;
  label: string;
  primary?: boolean;
};

export default function EmptyState({
  icon,
  illustration,
  title,
  description,
  actions = [],
  className = "",
  children,
}: {
  icon: string;
  /** 옵션: 큰 일러스트 PNG 경로 (예: "/illustrations/empty-cart.png"). 있으면 이모지 대신 노출 */
  illustration?: string;
  title: string;
  description?: ReactNode;
  actions?: EmptyStateAction[];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={`card p-8 md:p-10 text-center ${className}`}
    >
      {illustration ? (
        <Image
          src={illustration}
          alt=""
          aria-hidden
          width={160}
          height={160}
          className="mx-auto mb-3 w-32 h-32 md:w-40 md:h-40 object-contain"
        />
      ) : (
        <div className="text-5xl md:text-6xl mb-3" aria-hidden>
          {icon}
        </div>
      )}
      <h2 className="font-bold text-lg md:text-xl text-ink-1 mb-2 tracking-tight">
        {title}
      </h2>
      {description && (
        <div className="text-[15px] md:text-base text-ink-2 mb-6 leading-relaxed max-w-md mx-auto">
          {description}
        </div>
      )}
      {children}
      {actions.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 justify-center mt-1">
          {actions.map((a) => (
            <Link
              key={a.href + a.label}
              href={a.href}
              className={
                a.primary
                  ? "inline-flex items-center justify-center bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white px-6 py-3 rounded-xl font-semibold text-[15px] shadow-soft hover:shadow-raise min-h-[44px] transition"
                  : "inline-flex items-center justify-center bg-surface hover:bg-surface-muted text-ink-2 border border-line px-6 py-3 rounded-xl font-medium text-[15px] min-h-[44px] transition"
              }
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
