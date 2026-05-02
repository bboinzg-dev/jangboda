// 간단한 sync 토큰 인증 — /api/sync/* 같은 자동화/관리용 엔드포인트 보호용
// 클라이언트는 X-Sync-Token 헤더 또는 ?token= 쿼리로 전달
//
// 환경변수 SYNC_TOKEN 미설정 시 토큰 검증 비활성화 (개발 편의 + 첫 배포 호환)

import { NextRequest, NextResponse } from "next/server";

export function checkSyncAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.SYNC_TOKEN;
  if (!expected) return null; // 미설정 시 통과 (개발 모드)

  const provided =
    req.headers.get("x-sync-token") ??
    new URL(req.url).searchParams.get("token") ??
    "";

  // Vercel Cron이 자동으로 추가하는 헤더 — vercel.json의 cron이 호출할 때
  // Authorization: Bearer ${CRON_SECRET} 형태로 옴
  const cronAuth = req.headers.get("authorization");
  if (cronAuth?.startsWith("Bearer ") && process.env.CRON_SECRET) {
    if (cronAuth.slice(7) === process.env.CRON_SECRET) return null;
  }

  if (provided !== expected) {
    return NextResponse.json(
      { error: "권한 없음 — X-Sync-Token 헤더 필요" },
      { status: 401 }
    );
  }
  return null;
}

// 사용자 기여 엔드포인트 보호 — Rate limit 대신 간단한 honeypot/origin 체크
// 누구나 호출 가능하지만 abuse 방어
export function checkContribAuth(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin") ?? "";
  const referer = req.headers.get("referer") ?? "";
  const allowedHosts = [
    "jangboda.vercel.app",
    "localhost:3000",
    "127.0.0.1:3000",
  ];

  const ok = allowedHosts.some(
    (h) => origin.includes(h) || referer.includes(h)
  );

  // 개발 환경에선 origin 비어있을 수 있음 — 허용
  if (!origin && !referer && process.env.NODE_ENV !== "production") return null;

  if (!ok && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "허용되지 않은 origin" },
      { status: 403 }
    );
  }
  return null;
}
