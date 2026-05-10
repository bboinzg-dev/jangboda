// 경량 관찰성 추상화 — Sentry/Datadog/PostHog 같은 SaaS 키 등록 전에는 console만 사용.
// 키 등록 후에는 이 파일에서만 SDK 초기화하면 호출부 변경 없이 자동 전송.
//
// 사용:
//   import { logError, logEvent } from "@/lib/observability";
//   try { ... } catch (e) { logError("benefits/match", e, { profileId }); }
//   logEvent("receipt_uploaded", { count: 3, source: "clova" });
//
// 환경변수:
//   SENTRY_DSN — Sentry 활성화 (현재는 미연동, 향후 @sentry/nextjs 추가 시 분기)
//   NEXT_PUBLIC_POSTHOG_KEY — PostHog (클라이언트 events)

type Context = Record<string, unknown>;

const isProd = process.env.NODE_ENV === "production";
const sentryDsn = process.env.SENTRY_DSN;

/** 에러 보고. 프로덕션에서 SENTRY_DSN 설정되면 외부로 전송, 아니면 stderr. */
export function logError(scope: string, err: unknown, ctx?: Context): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const payload = {
    scope,
    message,
    stack,
    context: ctx ?? {},
    ts: new Date().toISOString(),
  };

  if (isProd && sentryDsn) {
    // TODO: @sentry/nextjs 도입 시 captureException(err, { tags: { scope }, extra: ctx })
    // 현재는 구조화 로그만 — Vercel 로그를 SaaS로 forward하는 환경에서도 검색 가능
    console.error("[error]", JSON.stringify(payload));
    return;
  }
  console.error(`[${scope}]`, message, ctx ?? "");
  if (stack && !isProd) console.error(stack);
}

/** 사용자/시스템 이벤트 보고. 분석/리텐션 측정용. */
export function logEvent(name: string, props?: Context): void {
  const payload = {
    event: name,
    props: props ?? {},
    ts: new Date().toISOString(),
  };
  if (isProd) {
    // TODO: PostHog/GA 도입 시 capture(name, props)
    console.log("[event]", JSON.stringify(payload));
    return;
  }
  console.log(`[event] ${name}`, props ?? "");
}
