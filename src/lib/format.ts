export function formatWon(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

export function formatRelativeDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  return `${Math.floor(diffDays / 30)}개월 전`;
}

export function freshnessTag(date: Date | string): {
  label: string;
  color: string;
} {
  const d = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  // 시맨틱 토큰 사용 — 다크모드 자동 보정 (tailwind.config.ts + globals.css CSS 변수)
  if (days <= 7) return { label: "최신", color: "bg-success-soft text-success-text" };
  if (days <= 30) return { label: "1개월 내", color: "bg-warning-soft text-warning-text" };
  return { label: "오래됨", color: "bg-danger-soft text-danger-text" };
}
