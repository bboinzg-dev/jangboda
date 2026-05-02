// 정부 혜택 모듈 진입 게이팅
// 현재는 무료 개방. 추후 User.points로 게이팅 예정.
//
// 게이팅 활성화 시점:
//   1. 장보다 포인트 시스템이 안정화된 후
//   2. 정책 결정: 최소 포인트 N점 또는 월 구독 등
//
// 활성화 방법:
//   아래 REQUIRED_POINTS를 0이 아닌 값으로 변경하고
//   /benefits/* 페이지에서 canAccessBenefits()를 호출

import type { User } from "@prisma/client";

export const REQUIRED_POINTS = 0; // 추후 포인트 게이팅 시 N점으로 변경

export function canAccessBenefits(user: Pick<User, "points"> | null): {
  allowed: boolean;
  pointsNeeded: number;
} {
  if (REQUIRED_POINTS === 0) return { allowed: true, pointsNeeded: 0 };
  if (!user) return { allowed: false, pointsNeeded: REQUIRED_POINTS };
  const needed = Math.max(0, REQUIRED_POINTS - user.points);
  return { allowed: needed === 0, pointsNeeded: needed };
}
