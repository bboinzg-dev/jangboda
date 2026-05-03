import Link from "next/link";
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
      className={`bg-white border border-border rounded-xl p-8 md:p-10 text-center ${className}`}
    >
      {illustration ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={illustration}
          alt=""
          aria-hidden
          className="mx-auto mb-3 w-32 h-32 md:w-40 md:h-40 object-contain"
          loading="lazy"
        />
      ) : (
        <div className="text-5xl md:text-6xl mb-3" aria-hidden>
          {icon}
        </div>
      )}
      <h2 className="font-bold text-base md:text-lg text-stone-900 mb-1">
        {title}
      </h2>
      {description && (
        <div className="text-sm text-stone-500 mb-5 leading-relaxed max-w-md mx-auto">
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
                  ? "inline-block bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg font-medium text-sm shadow-sm"
                  : "inline-block bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 px-5 py-2.5 rounded-lg font-medium text-sm"
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
