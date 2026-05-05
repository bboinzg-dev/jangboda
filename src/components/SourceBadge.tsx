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

// 매장이 온라인 전용 매장인지 판별
//
// 판정 우선순위 (좌표 결측에 의존 X):
//   1) chainName이 ONLINE_ONLY_CHAINS(쿠팡/옥션/G마켓/SSG/11번가/네이버쇼핑/기타 온라인몰 등) 매칭 → online
//   2) store name에 "온라인" 또는 address가 "온라인 (전국 배송)" → online
//   3) 그 외 → offline
//
// 이전에는 lat=0 && lng=0이면 무조건 온라인으로 판정했으나,
// parsa 동기화 매장 중 좌표 결측인 오프라인 매장(예: GS더프레시수원매탄점)이
// 잘못 온라인 섹션으로 빠지는 결함이 있어 화이트리스트 기반으로 변경.
import { isOnlineOnlyChain } from "@/lib/onlineMalls";

export function isOnlineStore(opts: {
  lat?: number;
  lng?: number;
  name?: string;
  chainName?: string;
  address?: string;
}): boolean {
  if (isOnlineOnlyChain(opts.chainName)) return true;
  if (opts.name?.includes("온라인")) return true;
  if (opts.address?.includes("온라인")) return true;
  return false;
}
