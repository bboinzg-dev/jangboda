type Props = { source: string };

const LABELS: Record<string, { text: string; className: string }> = {
  receipt: { text: "📸 영수증", className: "bg-blue-100 text-blue-700" },
  manual: { text: "✍️ 직접 입력", className: "bg-purple-100 text-purple-700" },
  kamis: { text: "📊 KAMIS 시세", className: "bg-emerald-100 text-emerald-700" },
  naver: { text: "🛍️ 네이버쇼핑", className: "bg-green-100 text-green-700" },
  seed: { text: "🌱 초기 데이터", className: "bg-stone-100 text-stone-600" },
  csv: { text: "📋 CSV 임포트", className: "bg-amber-100 text-amber-700" },
};

export default function SourceBadge({ source }: Props) {
  const meta = LABELS[source] ?? {
    text: source,
    className: "bg-stone-100 text-stone-600",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${meta.className}`}>
      {meta.text}
    </span>
  );
}

// 매장이 온라인 가상 매장인지 판별 (lat=0, lng=0 또는 "온라인" 포함)
export function isOnlineStore(opts: {
  lat?: number;
  lng?: number;
  name?: string;
  chainName?: string;
}): boolean {
  if (opts.lat === 0 && opts.lng === 0) return true;
  if (opts.name?.includes("온라인")) return true;
  const onlineChains = ["쿠팡", "G마켓", "지마켓", "SSG", "SSG.COM", "11번가", "옥션", "위메프", "티몬", "인터파크"];
  return !!(opts.chainName && onlineChains.some((c) => opts.chainName!.includes(c)));
}
