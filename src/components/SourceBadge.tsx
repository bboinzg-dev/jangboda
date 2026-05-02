type Props = { source: string };

const LABELS: Record<string, { text: string; className: string }> = {
  receipt: { text: "📸 영수증", className: "bg-blue-100 text-blue-700" },
  manual: { text: "✍️ 직접 입력", className: "bg-purple-100 text-purple-700" },
  kamis: { text: "📊 KAMIS 시세", className: "bg-emerald-100 text-emerald-700" },
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
