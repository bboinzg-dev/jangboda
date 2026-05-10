// 통합 cron 인증 — 프로덕션에서 CRON_SECRET 미설정/불일치면 거부
// 이전: secret 미설정 시 무조건 통과 → 누구나 cron 호출 가능 (DoS, 데이터 오염 위험)
//
// 정책:
//   - production: CRON_SECRET 필수 + Authorization Bearer 일치해야 통과
//   - dev/preview: secret 없으면 dev 편의를 위해 통과 (있으면 검증)

import type { NextRequest } from "next/server";

export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!secret) {
    // 프로덕션에서 secret 미설정은 설정 누락 — 안전을 위해 거부
    return !isProd;
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
