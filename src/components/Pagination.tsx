import Link from "next/link";

// 재사용 가능한 서버 컴포넌트 페이지네이션
// - buildHref(page): 다른 query string은 보존하면서 page 만 교체한 href 반환
// - 단순화된 UI: ← 이전 / N / 전체 / 다음 →
export default function Pagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  /** 페이지 번호 → href 빌더 (다른 query 보존) */
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav
      className="flex items-center justify-center gap-2 mt-6 mb-2 text-sm"
      aria-label="페이지 이동"
    >
      {hasPrev ? (
        <Link
          href={buildHref(currentPage - 1)}
          className="px-3 py-1.5 border border-border rounded hover:bg-surface-muted"
          aria-label="이전 페이지"
        >
          ← 이전
        </Link>
      ) : (
        <span
          className="px-3 py-1.5 border border-border rounded text-stone-300 cursor-not-allowed"
          aria-disabled="true"
        >
          ← 이전
        </span>
      )}

      <span className="text-ink-4 px-3">
        <span className="font-bold text-ink-1">{currentPage}</span> /{" "}
        {totalPages}
      </span>

      {hasNext ? (
        <Link
          href={buildHref(currentPage + 1)}
          className="px-3 py-1.5 border border-border rounded hover:bg-surface-muted"
          aria-label="다음 페이지"
        >
          다음 →
        </Link>
      ) : (
        <span
          className="px-3 py-1.5 border border-border rounded text-stone-300 cursor-not-allowed"
          aria-disabled="true"
        >
          다음 →
        </span>
      )}
    </nav>
  );
}
