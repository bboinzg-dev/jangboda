// 포인트 마일스톤 — 사용자가 "내 포인트가 무엇을 풀어주는가"를 한눈에 보게 하는 정책 표
// 게이팅 임계값(REQUIRED_POINTS=10 정부혜택)과 reward 페이지 표기를 한 곳에서 관리
//
// 실제 unlock이 작동하는 항목만 등재 — "약속만 하고 안 풀리는" 마일스톤은 신뢰 손상.
// 새로운 unlock을 추가할 때는 이 파일을 우선 수정해서 정책을 명시한 뒤 호출부에 적용.

export type RewardTier = {
  /** 임계 포인트 */
  points: number;
  /** 짧은 라벨 — 카드 헤더 */
  label: string;
  /** 한 줄 설명 — 무엇이 풀리는지 사용자 시점 */
  description: string;
  /** 이 tier를 풀어주는 행동 가이드 (영수증 N장, 직접 등록 N건 등) */
  howTo?: string;
  /** 실제 unlock이 동작하는 코드 위치 (감사용) */
  enforcedAt?: string;
};

export const REWARD_TIERS: RewardTier[] = [
  {
    points: 0,
    label: "가입 직후",
    description:
      "장바구니 비교 · 가계부 · 영수증 등록 · 매장 검색 · 주변 마트 지도 · 회수 식품 알림 — 가입만 해도 모든 핵심 기능 사용 가능",
  },
  {
    points: 10,
    label: "정부 혜택 추천 잠금 해제",
    description:
      "내 자격에 맞는 정부 지원금·혜택 자동 추천. 마감 임박 푸시 알림.",
    howTo: "영수증 5장 (장당 +2점) 또는 가격 직접 등록 2건 (건당 +5점)",
    enforcedAt: "src/lib/benefits/access.ts (REQUIRED_POINTS)",
  },
  {
    points: 50,
    label: "이번 주 우리 동네 특가 위젯",
    description:
      "내 즐겨찾기 매장과 자주 사는 상품 기준으로 이번 주 가장 많이 떨어진 상품 TOP 10을 홈 화면에 노출.",
    howTo: "영수증 25장 또는 가격 등록 10건",
    enforcedAt: "src/components/home/WeeklyDealsWidget.tsx",
  },
  {
    points: 100,
    label: "베타 기능 우선 체험",
    description:
      "새 기능을 일반 출시 전에 먼저 사용해볼 수 있어요. 피드백을 보내면 추가 포인트도.",
    howTo: "영수증 50장 또는 꾸준한 기여",
  },
  {
    points: 500,
    label: "이웃 도우미 — 등록 가격 신뢰도 가산점",
    description:
      "내가 등록한 가격이 다른 사용자에게 표시될 때 '신뢰 기여자' 배지로 우선 노출됩니다.",
    howTo: "영수증 250장 또는 가격 100건",
  },
  {
    points: 1000,
    label: "🏆 장보다 마스터",
    description:
      "프로필에 마스터 배지. 동네별 랭킹에서 최상위 표시. 운영팀 대화 채널 우선 응답.",
    howTo: "영수증 500장 — 동네에 큰 도움을 준 사용자",
  },
];

/** 다음 미달성 tier (현재 포인트보다 큰 첫 tier) */
export function nextTier(points: number): RewardTier | null {
  return REWARD_TIERS.find((t) => t.points > points) ?? null;
}

/** 직전(이미 달성한) tier */
export function currentTier(points: number): RewardTier {
  let cur = REWARD_TIERS[0];
  for (const t of REWARD_TIERS) {
    if (t.points <= points) cur = t;
  }
  return cur;
}
