"use client";

// 클라이언트 측 관찰성 — Sentry 브라우저 + PostHog 자동 초기화
// 환경변수 미설정 시 완전한 noop. 배포 환경에서 키 등록만 하면 자동 활성화.
//
// 등록 방법 (각 SaaS 무료 티어 가입 후):
//   NEXT_PUBLIC_SENTRY_DSN=https://xxxx@sentry.io/yyyy
//   NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxx
//   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   (선택, 기본 us)
//
// 페이지뷰 자동 캡처는 PostHog의 capture_pageview 옵션으로 처리.
// 명시적 이벤트는 src/lib/observability.ts의 logEvent() 사용.

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

let initialized = false;

function initOnce() {
  if (initialized) return;
  initialized = true;

  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (sentryDsn && process.env.NODE_ENV === "production") {
    Sentry.init({
      dsn: sentryDsn,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0, // 세션 리플레이는 quota 부담 — 명시적 활성화 전까지 0
      replaysOnErrorSampleRate: 0.1, // 에러 발생 시만 10%
      environment: process.env.NODE_ENV,
    });
  }

  const phKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (phKey) {
    posthog.init(phKey, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      person_profiles: "identified_only", // 익명 사용자에게 새 person 안 만듦 (quota 절약)
      capture_pageview: false, // SPA 라우팅은 우리가 직접 capture
      capture_pageleave: true,
      autocapture: false, // 명시적 이벤트만 — 노이즈 줄이고 의미 있는 신호만
    });
    // lib/observability.ts에서 window.posthog로 접근하므로 명시 바인딩
    (window as unknown as { posthog: typeof posthog }).posthog = posthog;
  }
}

export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    initOnce();
  }, []);

  // SPA 라우팅 페이지뷰 — pathname 또는 query 변경 시
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
    if (typeof window === "undefined") return;
    const qs = searchParams?.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}
