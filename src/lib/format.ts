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
  if (days <= 7) return { label: "최신", color: "bg-emerald-100 text-emerald-700" };
  if (days <= 30) return { label: "1개월 내", color: "bg-amber-100 text-amber-700" };
  return { label: "오래됨", color: "bg-rose-100 text-rose-700" };
}
