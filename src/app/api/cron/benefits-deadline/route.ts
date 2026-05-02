// Vercel Cron: 매일 09:00 KST (= 00:00 UTC) — 정부 혜택 마감 임박 푸시 발송
//
// 인증: Authorization: Bearer ${CRON_SECRET} (Vercel Cron 자동) 또는 X-Sync-Token (수동)
//   - checkSyncAuth(req) — 기존 alerts/check 패턴 재사용
//
// 수동 트리거 (개발/디버깅):
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     https://jangboda.vercel.app/api/cron/benefits-deadline
//   또는 로컬:
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//     http://localhost:3000/api/cron/benefits-deadline
//
// GET = Vercel cron 자동 호출, POST = 수동/외부 자동화 (둘 다 동일 동작)

import { NextRequest, NextResponse } from "next/server";
import { checkSyncAuth } from "@/lib/auth";
import { notifyUpcomingDeadlines } from "@/lib/benefits/notifyDeadline";

// web-push가 Node API에 의존 (Edge runtime 불가)
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  try {
    const result = await notifyUpcomingDeadlines();
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  } catch (e) {
    console.error("[cron/benefits-deadline] 실패", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
