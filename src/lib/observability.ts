// 통합 관찰성 — Sentry(에러) + PostHog(이벤트) 추상화
// SDK가 init되지 않으면 자동 noop. 환경변수 등록만으로 외부 전송 활성화.
//
// 환경변수:
//   SENTRY_DSN              — 서버 측 에러 (instrumentation.ts에서 init)
//   NEXT_PUBLIC_SENTRY_DSN  — 브라우저 에러 (Analytics.tsx에서 init)
//   NEXT_PUBLIC_POSTHOG_KEY — 분석 이벤트 (Analytics.tsx에서 init)
//
// 사용:
//   logError("benefits/match", err, { profileId });
//   logEvent("receipt_uploaded", { count: 3, source: "clova" });
//   identifyUser(userId, { plan: "free" });

import * as Sentry from "@sentry/nextjs";

type Context = Record<string, unknown>;

const isProd = process.env.NODE_ENV === "production";

/** 에러 보고. Sentry가 init돼 있으면 자동 전송, 아니면 콘솔만. */
export function logError(scope: string, err: unknown, ctx?: Context): void {
  const message = err instanceof Error ? err.message : String(err);

  // Sentry — init 안 됐으면 내부적으로 no-op
  try {
    Sentry.captureException(err, {
      tags: { scope },
      extra: ctx,
    });
  } catch {
    // SDK 자체가 사용 불가능한 환경이면 무시
  }

  if (!isProd) {
    console.error(`[${scope}]`, message, ctx ?? "");
    if (err instanceof Error && err.stack) console.error(err.stack);
  } else {
    // 구조화 로그 — Vercel 로그 forward 환경에서도 검색 가능
    console.error(
      "[error]",
      JSON.stringify({
        scope,
        message,
        context: ctx ?? {},
        ts: new Date().toISOString(),
      }),
    );
  }
}

/** 사용자/시스템 이벤트 보고. 클라이언트에서는 PostHog로 자동 전송. */
export function logEvent(name: string, props?: Context): void {
  // 클라이언트 → PostHog
  if (typeof window !== "undefined") {
    const ph = (window as unknown as { posthog?: { capture?: (n: string, p?: Context) => void } })
      .posthog;
    try {
      ph?.capture?.(name, props);
    } catch {
      // SDK init 전이면 무시
    }
  }

  if (!isProd) {
    console.log(`[event] ${name}`, props ?? "");
  } else {
    console.log(
      "[event]",
      JSON.stringify({
        event: name,
        props: props ?? {},
        ts: new Date().toISOString(),
      }),
    );
  }
}

/** 로그인 사용자 식별 — PostHog에 user_id 매핑. Sentry user 컨텍스트도 함께. */
export function identifyUser(
  userId: string,
  props?: { nickname?: string; role?: string },
): void {
  try {
    Sentry.setUser({ id: userId, username: props?.nickname });
  } catch {
    // noop
  }
  if (typeof window !== "undefined") {
    const ph = (window as unknown as {
      posthog?: { identify?: (id: string, p?: Context) => void };
    }).posthog;
    try {
      ph?.identify?.(userId, props);
    } catch {
      // noop
    }
  }
}
