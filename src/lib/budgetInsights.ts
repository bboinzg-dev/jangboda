// 가계부 자동 인사이트 — 룰 기반 (LLM 불필요)
// 사용자에게 "오 이거 진짜 도움된다" 모먼트를 만드는 멘트 1-4개를 데이터에서 자동 생성.

import { formatWon } from "./format";

export type Insight = {
  emoji: string;
  tone: "positive" | "negative" | "neutral";
  text: string;
  detail?: string;
  link?: string;
};

type InsightInput = {
  kpi: {
    thisMonth: number;
    lastMonth: number;
    monthDeltaPct: number | null;
    savedAmount: number;
    promoCount: number;
    totalPriceCount: number;
    storeCount: number;
  };
  byCategory: { category: string; total: number }[];
  byStore: { storeName: string; chainName: string; total: number }[];
  overpaid: {
    productId: string;
    productName: string;
    paid: number;
    minPrice: number;
    diff: number;
  }[];
  totalCount: number;
};

export function generateInsights(data: InsightInput): Insight[] {
  const insights: Insight[] = [];

  // 1. 절약 칭찬 — 행사가 활용 보상감 (positive top priority)
  if (data.kpi.savedAmount >= 1000) {
    insights.push({
      emoji: "🎉",
      tone: "positive",
      text: `행사가로 ${formatWon(data.kpi.savedAmount)} 아끼셨어요!`,
      detail: `${data.kpi.promoCount}건 행사 활용 (전체의 ${Math.round(
        (data.kpi.promoCount / Math.max(data.kpi.totalPriceCount, 1)) * 100,
      )}%)`,
    });
  }

  // 2. 지출 증가/감소 — 이전 달 비교
  if (data.kpi.monthDeltaPct !== null && Math.abs(data.kpi.monthDeltaPct) >= 20) {
    if (data.kpi.monthDeltaPct > 0) {
      insights.push({
        emoji: "📈",
        tone: "negative",
        text: `이번 달 지출이 지난달보다 ${data.kpi.monthDeltaPct}% 증가했어요.`,
        detail: `${formatWon(data.kpi.thisMonth - data.kpi.lastMonth)} 더 썼어요`,
      });
    } else {
      insights.push({
        emoji: "👏",
        tone: "positive",
        text: `이번 달 지출이 지난달보다 ${Math.abs(data.kpi.monthDeltaPct)}% 줄었어요.`,
        detail: `${formatWon(data.kpi.lastMonth - data.kpi.thisMonth)} 절약`,
      });
    }
  }

  // 3. 카테고리 편중 — 30% 이상이면 알림
  if (data.byCategory.length > 0) {
    const top = data.byCategory[0];
    const totalSum = data.byCategory.reduce((s, c) => s + c.total, 0);
    if (totalSum > 0) {
      const pct = Math.round((top.total / totalSum) * 100);
      if (pct >= 30) {
        insights.push({
          emoji: "🥕",
          tone: "neutral",
          text: `지출의 ${pct}%가 ${top.category}에 집중돼요.`,
          detail: formatWon(top.total),
        });
      }
    }
  }

  // 4. 매장 편중 — 50% 이상이면 알림
  if (data.byStore.length > 0 && data.byStore[0].total > 0) {
    const top = data.byStore[0];
    const totalSum = data.byStore.reduce((s, b) => s + b.total, 0);
    if (totalSum > 0) {
      const pct = Math.round((top.total / totalSum) * 100);
      if (pct >= 50) {
        insights.push({
          emoji: "🏪",
          tone: "neutral",
          text: `${top.chainName} ${top.storeName}을 가장 자주 이용하시네요.`,
          detail: `전체 지출의 ${pct}%`,
        });
      }
    }
  }

  // 5. 비싸게 산 상품 — 가장 큰 차액 1건
  if (data.overpaid.length > 0) {
    const top = data.overpaid[0];
    if (top.diff >= 500) {
      insights.push({
        emoji: "💸",
        tone: "negative",
        text: `${top.productName}, 다른 매장에서 ${formatWon(top.diff)} 더 싸게 살 수 있었어요.`,
        detail: `최저가 ${formatWon(top.minPrice)} vs 내가 산 가격 ${formatWon(top.paid)}`,
        link: `/products/${top.productId}`,
      });
    }
  }

  // 6. 매장 다양성 — 너무 한 곳만 가는지
  if (data.kpi.storeCount === 1 && data.totalCount >= 5) {
    insights.push({
      emoji: "🌍",
      tone: "neutral",
      text: "한 매장만 이용하시네요. 다른 마트 가격도 비교해보세요.",
      link: "/stores",
    });
  } else if (data.kpi.storeCount >= 4) {
    insights.push({
      emoji: "🌟",
      tone: "positive",
      text: `${data.kpi.storeCount}곳의 매장을 비교 이용 중이세요!`,
      detail: "가격비교에 능숙한 똑똑한 소비자",
    });
  }

  // 7. 데이터 부족 안내
  if (data.totalCount < 3) {
    insights.push({
      emoji: "📊",
      tone: "neutral",
      text: "영수증을 더 등록하면 인사이트가 정확해져요.",
      detail: `현재 ${data.totalCount}건 등록`,
      link: "/upload",
    });
  }

  // 우선순위 낮은 것부터 슬라이스 — 최대 4개
  return insights.slice(0, 4);
}
