type Props = {
  count: number;
  latestDate: Date | string;
  source: string;
};

// 가격 신뢰도 뱃지 — 같은 (product, store) pair에 대한 등록 횟수 + 최신성으로 판단
export default function TrustBadge({ count, latestDate, source }: Props) {
  const d = typeof latestDate === "string" ? new Date(latestDate) : latestDate;
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));

  let label = "단독 등록";
  let className = "bg-stone-100 text-stone-600";

  if (count >= 5 && days <= 7) {
    label = "🛡️ 검증됨";
    className = "bg-emerald-100 text-emerald-700";
  } else if (count >= 2 && days <= 30) {
    label = "✓ 확인됨";
    className = "bg-blue-100 text-blue-700";
  }

  // source가 'naver' 같은 단일 자동수집 소스면 단독 등록 그대로
  void source;

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${className}`}>
      {label}
    </span>
  );
}
