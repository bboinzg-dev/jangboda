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

type SeverityLevel = "warning" | "error" | "fatal";

type LogErrorOptions = {
  /**
   * Sentry severity. cron 실패 등 우선순위 높은 알림은 "fatal" 권장 —
   * Sentry 알림 룰에서 fatal만 필터링하면 페이지 호출 등 강한 액션 연결 가능.
   * default: "error"
   */
  level?: SeverityLevel;
  /** Sentry 추가 태그 (kind, region 등 알림 룰 분기에 사용) */
  tags?: Record<string, string>;
};

const isProd = process.env.NODE_ENV === "production";

/**
 * 에러 보고. Sentry가 init돼 있으면 자동 전송, 아니면 콘솔만.
 * 3번째 인자는 hybrid — 단순 context 객체 또는 { level, tags, ... } 옵션.
 * 기존 호출자 (`logError("x", e, { foo: 1 })`)는 그대로 동작.
 */
export function logError(
  scope: string,
  err: unknown,
  ctxOrOpts?: Context,
  opts?: LogErrorOptions,
): void {
  const message = err instanceof Error ? err.message : String(err);
  const ctx = ctxOrOpts;
  const level = opts?.level ?? "error";
  const extraTags = opts?.tags ?? {};

  // Sentry — init 안 됐으면 내부적으로 no-op
  try {
    Sentry.captureException(err, {
      level,
      tags: { scope, ...extraTags },
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
        level,
        message,
        context: ctx ?? {},
        tags: extraTags,
        ts: new Date().toISOString(),
      }),
    );
  }
}

/**
 * Cron 실패 전용 에러 보고 — level=fatal + tags.kind=cron 자동 부여.
 * Sentry 알림 룰에서 `kind:cron AND level:fatal` 필터로 cron 장애만 추출 가능.
 */
export function logCronFailure(
  scope: string,
  err: unknown,
  metrics?: Context,
): void {
  logError(scope, err, metrics, {
    level: "fatal",
    tags: { kind: "cron" },
  });
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
