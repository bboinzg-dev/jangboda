// Next 14 instrumentation hook — 서버/Edge 런타임 시작 시 1회 실행
// SENTRY_DSN 미설정이면 init 호출 안 함 (완전한 noop) — 배포 환경에서만 자동 활성화
import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1, // 10% 샘플 — 무료 티어 quota 보호
      enabled: process.env.NODE_ENV === "production",
      environment: process.env.NODE_ENV ?? "development",
    });
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      enabled: process.env.NODE_ENV === "production",
      environment: process.env.NODE_ENV ?? "development",
    });
  }
}

// Next 14의 server-side request error 자동 캡처 hook
export const onRequestError = Sentry.captureRequestError;
