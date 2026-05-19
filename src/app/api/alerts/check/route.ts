// Cron 또는 수동 트리거로 호출 — 모든 활성 알림을 검사하고 임계가 도달 시 푸시 발송
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/push";
import { checkSyncAuth } from "@/lib/auth";
import { formatWon } from "@/lib/format";

export const maxDuration = 60;

// POST /api/alerts/check
// 각 PriceAlert에 대해 해당 product의 최저가가 threshold 이하인지 확인
// 이하면 → 사용자의 모든 PushSubscription에 푸시 발송 + lastNotifiedAt 갱신
// 24시간 내 이미 알린 알림은 스킵 (스팸 방지)
export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const alerts = await prisma.priceAlert.findMany({
    where: { active: true },
    include: {
      product: { select: { id: true, name: true } },
      user: {
        include: { pushSubs: true },
      },
    },
  });

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let pushed = 0;
  let pushFailed = 0;
  const expiredEndpoints: string[] = [];
  const triggeredAlertIds: string[] = [];

  // 24시간 내 이미 알린 건은 미리 스킵
  const eligible = alerts.filter(
    (a) => !a.lastNotifiedAt || a.lastNotifiedAt <= oneDayAgo
  );
  const checked = alerts.length;

  // 대상 product들의 최저가를 한 번에 조회 (N+1 방지: 알림 수만큼 쿼리 → 1회)
  const productIds = Array.from(new Set(eligible.map((a) => a.productId)));
  const allPrices =
    productIds.length === 0
      ? []
      : await prisma.price.findMany({
          where: { productId: { in: productIds } },
          orderBy: { listPrice: "asc" },
          include: { store: { include: { chain: true } } },
        });

  // productId → 최저가 행 (orderBy asc 이므로 첫 매칭이 최저)
  const minByProductId = new Map<string, (typeof allPrices)[number]>();
  for (const p of allPrices) {
    if (!minByProductId.has(p.productId)) minByProductId.set(p.productId, p);
  }

  for (const alert of eligible) {
    const minRow = minByProductId.get(alert.productId);
    if (!minRow || (minRow.listPrice ?? Infinity) > alert.threshold) continue;

    triggeredAlertIds.push(alert.id);

    // 사용자의 모든 구독에 발송
    for (const sub of alert.user.pushSubs) {
      const r = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        {
          title: `🎯 ${alert.product.name} 알림`,
          body: `${minRow.store.chain.name} ${formatWon(minRow.listPrice ?? 0)} (목표 ${formatWon(alert.threshold)} 이하)`,
          url: `/products/${alert.product.id}`,
        }
      );
      if (r.ok) {
        pushed++;
      } else {
        pushFailed++;
        if (r.gone) expiredEndpoints.push(sub.endpoint);
      }
    }
  }

  // 트리거된 알림의 lastNotifiedAt 일괄 갱신 (N개 update → 1회 updateMany)
  if (triggeredAlertIds.length > 0) {
    await prisma.priceAlert.updateMany({
      where: { id: { in: triggeredAlertIds } },
      data: { lastNotifiedAt: new Date() },
    });
  }
  const triggered = triggeredAlertIds.length;

  // 만료된 구독 정리
  if (expiredEndpoints.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: expiredEndpoints } },
    });
  }

  return NextResponse.json({
    ok: true,
    checked,
    triggered,
    pushed,
    pushFailed,
    expiredCleaned: expiredEndpoints.length,
  });
}
