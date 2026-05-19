// 간단한 sync 토큰 인증 — /api/sync/* 같은 자동화/관리용 엔드포인트 보호용
// 클라이언트는 X-Sync-Token 헤더 또는 ?token= 쿼리로 전달
//
// 환경변수 SYNC_TOKEN 미설정 시 토큰 검증 비활성화 (개발 편의 + 첫 배포 호환)

import { NextRequest, NextResponse } from "next/server";

// 같은 origin 판정용 화이트리스트 호스트 — host:port 형태로 정확 매칭.
// `.includes()`로 부분 매칭하면 `jangboda.vercel.app.attacker.com` 같은
// 서브도메인 트릭이 통과하므로 URL 파싱 후 host 비교가 안전.
const ALLOWED_HOSTS = new Set<string>([
  "jangboda.vercel.app",
  "localhost:3000",
  "127.0.0.1:3000",
]);

function hostOf(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function isAllowedOrigin(req: NextRequest): boolean {
  const originHost = hostOf(req.headers.get("origin") ?? "");
  if (originHost && ALLOWED_HOSTS.has(originHost)) return true;
  const refererHost = hostOf(req.headers.get("referer") ?? "");
  if (refererHost && ALLOWED_HOSTS.has(refererHost)) return true;
  return false;
}

export function checkSyncAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.SYNC_TOKEN;
  if (!expected) {
    // 프로덕션에서 토큰 미설정은 설정 누락 — 누구나 sync 호출 가능하면 위험
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "서버 설정 오류 — SYNC_TOKEN 미설정" },
        { status: 503 }
      );
    }
    return null; // 개발/테스트 환경만 통과
  }

  // 1. Vercel Cron 인증 (Authorization: Bearer ${CRON_SECRET})
  const cronAuth = req.headers.get("authorization");
  if (cronAuth?.startsWith("Bearer ") && process.env.CRON_SECRET) {
    if (cronAuth.slice(7) === process.env.CRON_SECRET) return null;
  }

  // 2. X-Sync-Token 헤더 또는 ?token= (외부 자동화)
  const provided =
    req.headers.get("x-sync-token") ??
    new URL(req.url).searchParams.get("token") ??
    "";
  if (provided === expected) return null;

  // 3. 우리 사이트 UI에서 직접 호출 (같은 origin) — 통과
  // 외부 봇/스크레이퍼는 origin 안 보내거나 다른 origin이라 차단됨
  if (isAllowedOrigin(req)) return null;

  return NextResponse.json(
    { error: "권한 없음 — X-Sync-Token 헤더 필요 또는 사이트 내부 호출" },
    { status: 401 }
  );
}

// 사용자 기여 엔드포인트 보호 — Rate limit 대신 간단한 honeypot/origin 체크
// 누구나 호출 가능하지만 abuse 방어
export function checkContribAuth(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin") ?? "";
  const referer = req.headers.get("referer") ?? "";

  // 개발 환경에선 origin 비어있을 수 있음 — 허용
  if (!origin && !referer && process.env.NODE_ENV !== "production") return null;

  if (!isAllowedOrigin(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "허용되지 않은 origin" },
      { status: 403 }
    );
  }
  return null;
}
