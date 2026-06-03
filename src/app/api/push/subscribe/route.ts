// 브라우저 푸시 구독 등록/해제
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { logEvent } from "@/lib/observability";

// POST /api/push/subscribe — 구독 등록
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { endpoint, keys } = body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "구독 정보 누락" }, { status: 400 });
  }

  // 사용자 존재 보장 (auth/callback에서 누락된 케이스 대비)
  await prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      nickname: `사용자-${user.id.slice(0, 4)}`,
    },
  });

  // 소유자 변경 탐지 — 정당한 공유기기 재로그인(A→B)은 막지 않고 관찰성으로만 기록.
  // (유출된 endpoint를 악용한 비정상 재할당을 사후 추적하기 위함)
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { userId: true },
  });
  if (existing && existing.userId !== user.id) {
    logEvent("push.subscription.reassigned", {
      fromUserId: existing.userId,
      toUserId: user.id,
    });
  }

  // 같은 endpoint면 user_id만 업데이트
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
    create: {
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/push/subscribe?endpoint=... — 구독 해제
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json({ error: "endpoint 필요" }, { status: 400 });
  }
  await prisma.pushSubscription.deleteMany({ where: { endpoint } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
