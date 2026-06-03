export function formatWon(n: number): string {
  return n.toLocaleString("ko-KR") + "원";
}

// now 인자: 클라이언트 컴포넌트에서 SSR/CSR 하이드레이션 불일치를 막기 위해 서버가
// 렌더 시각을 주입할 수 있게 함. 서버 전용 호출부는 기본값(Date.now())으로 그대로 동작.
export function formatRelativeDate(date: Date | string, now: number = Date.now()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  return `${Math.floor(diffDays / 30)}개월 전`;
}

export function freshnessTag(date: Date | string, now: number = Date.now()): {
  label: string;
  color: string;
} {
  const d = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24));
  // 시맨틱 토큰 사용 — 다크모드 자동 보정 (tailwind.config.ts + globals.css CSS 변수)
  if (days <= 7) return { label: "최신", color: "bg-success-soft text-success-text" };
  if (days <= 30) return { label: "1개월 내", color: "bg-warning-soft text-warning-text" };
  return { label: "오래됨", color: "bg-danger-soft text-danger-text" };
}
