type Props = {
  count: number;
  latestDate: Date | string;
  source: string;
  // 부모(클라이언트 컴포넌트)가 서버 렌더 시각(ms)을 주입 — 하이드레이션 불일치 방지.
  // 렌더 중 Date.now() 직접 호출을 없애 SSR/CSR이 동일 기준 시각을 쓰게 한다.
  now: number;
};

// 가격 신뢰도 뱃지 — 같은 (product, store) pair에 대한 등록 횟수 + 최신성으로 판단
export default function TrustBadge({ count, latestDate, source, now }: Props) {
  const d = typeof latestDate === "string" ? new Date(latestDate) : latestDate;
  const days = Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24));

  let label = "단독 등록";
  let className = "bg-surface-muted text-ink-3";

  if (count >= 5 && days <= 7) {
    label = "🛡️ 검증됨";
    className = "bg-success-soft text-success-text";
  } else if (count >= 2 && days <= 30) {
    label = "✓ 확인됨";
    className = "bg-info-soft text-info-text";
  }

  // source가 'naver' 같은 단일 자동수집 소스면 단독 등록 그대로
  void source;

  return (
    <span className={`text-3xs px-1.5 py-0.5 rounded ${className}`}>
      {label}
    </span>
  );
}
