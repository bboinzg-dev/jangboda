// 정부 혜택 공통 카드 컴포넌트
// 매칭 페이지(홈/matches), 저장 페이지, 카탈로그 페이지에서 공통 사용
// 모든 데이터 변환(stripHtml/categoryGroup/sourceLabel/D-day)은 내부에서 수행
import Link from "next/link";
import { stripHtml } from "@/lib/benefits/sanitize";
import { sourceLabel } from "@/lib/benefits/types";
import { categoryGroup } from "@/lib/benefits/categories";

export interface BenefitCardProps {
  href: string; // 예: /benefits/{id}
  title: string;
  summary?: string | null;
  agency?: string | null;
  category?: string | null; // 행안부 원본 카테고리 — 내부에서 categoryGroup() 적용
  sourceCode?: string | null; // GOV24 등 — 내부에서 sourceLabel() 적용
  applyEndAt?: Date | null;
  score?: number; // 매칭 점수 (있으면 ScoreBadge 표시)
  status?: "matched" | "uncertain" | "notEligible";
  missingFields?: string[]; // 보강 필요 필드 (있으면 N개 추가 평가 hint)
  variant?: "compact" | "default"; // compact: 카탈로그용, default: 매칭용
}

// D-day 라벨 색상 — 7일 이내 rose, 30일 이내 amber, 그 외 stone
function dDayClassName(dDays: number): string {
  if (dDays < 0) return "text-ink-4";
  if (dDays <= 7) return "text-danger font-medium";
  if (dDays <= 30) return "text-warning";
  return "text-ink-4";
}

// 매칭 점수 배지 — status에 따른 색상 분기
function ScoreBadge({
  score,
  status,
}: {
  score: number;
  status: "matched" | "uncertain" | "notEligible";
}) {
  const color =
    status === "matched"
      ? score >= 70
        ? "bg-indigo-100 text-indigo-700"
        : "bg-info-soft text-info-text"
      : status === "uncertain"
      ? "bg-warning-soft text-warning-text"
      : "bg-surface-muted text-ink-3";
  const label =
    status === "matched" ? "매칭" : status === "uncertain" ? "검토" : "제외";
  return (
    <div className={`shrink-0 text-center rounded px-2 py-1 ${color}`}>
      <div className="text-base font-bold leading-none">{score}</div>
      <div className="text-[10px] mt-0.5">{label}</div>
    </div>
  );
}

export default function BenefitCard({
  href,
  title,
  summary,
  agency,
  category,
  sourceCode,
  applyEndAt,
  score,
  status,
  missingFields,
  variant = "default",
}: BenefitCardProps) {
  // 데이터 정제 — 페이지에서는 raw 값 그대로 전달받음
  const cleanTitle = stripHtml(title);
  const cleanSummary = stripHtml(summary);
  const catLabel = category ? categoryGroup(category) : null;
  const srcLabel = sourceCode ? sourceLabel(sourceCode) : null;
  const dDays =
    applyEndAt != null
      ? Math.ceil((applyEndAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      : null;

  const isCompact = variant === "compact";
  const padding = isCompact ? "p-4" : "p-4";

  return (
    <Link
      href={href}
      className={`block bg-surface border border-line hover:border-indigo-300 hover:shadow-sm rounded-lg ${padding} transition`}
    >
      {/* 상단: 배지 + 제목 + (옵션) 점수 배지 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-ink-4 mb-1 flex-wrap">
            {srcLabel && (
              <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                {srcLabel}
              </span>
            )}
            {catLabel && (
              <span className="bg-surface-muted px-2 py-0.5 rounded">{catLabel}</span>
            )}
            {agency && <span className="truncate">{agency}</span>}
          </div>
          <h3 className="font-semibold text-ink-1 leading-snug line-clamp-2">
            {cleanTitle}
          </h3>
        </div>
        {score !== undefined && status && (
          <ScoreBadge score={score} status={status} />
        )}
      </div>

      {/* 요약 */}
      {cleanSummary && (
        <p className="text-sm text-ink-3 line-clamp-2 mb-2">{cleanSummary}</p>
      )}

      {/* 하단 메타: D-day + 보강 필드 hint */}
      <div className="flex items-center gap-3 text-xs text-ink-4">
        {dDays !== null && (
          <span className={dDayClassName(dDays)}>
            {dDays >= 0 ? `D-${dDays}` : "마감"}
          </span>
        )}
        {missingFields && missingFields.length > 0 && (
          <span>입력 보강 시 {missingFields.length}개 추가 평가</span>
        )}
      </div>
    </Link>
  );
}
