// 정부 혜택 모듈 진입 게이팅
// 영수증 기여로 누적된 User.points로 게이팅. /benefits/layout.tsx에서 호출.

import type { User } from "@prisma/client";

// 미래에 0으로 풀거나 50으로 올리는 정책 변경 가능하도록 number 타입 명시
export const REQUIRED_POINTS: number = 10; // 영수증 2-5장 정도

export function canAccessBenefits(user: Pick<User, "points"> | null): {
  allowed: boolean;
  pointsNeeded: number;
  currentPoints: number;
} {
  if (REQUIRED_POINTS === 0) return { allowed: true, pointsNeeded: 0, currentPoints: user?.points ?? 0 };
  if (!user) return { allowed: false, pointsNeeded: REQUIRED_POINTS, currentPoints: 0 };
  const needed = Math.max(0, REQUIRED_POINTS - user.points);
  return { allowed: needed === 0, pointsNeeded: needed, currentPoints: user.points };
}
