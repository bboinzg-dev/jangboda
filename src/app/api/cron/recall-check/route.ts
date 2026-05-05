// Vercel Cron: 매 6시간 — 회수 식품 데이터 동기화 직후 사용자 영수증 product와 매칭
//
// 흐름:
// 1. 모든 활성 사용자의 receipt(verified)의 prices 안 product.barcode 수집
// 2. Recall.barcode와 매칭 (IN 쿼리)
// 3. 매칭된 사용자별 push 알림 발송
//    "지난주에 산 OO이 식약처 회수 대상이에요"
// 4. 푸시 결과 + 매칭 통계 반환
//
// 인증: Authorization: Bearer ${CRON_SECRET}
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import { sendPushNotification } from "@/lib/push";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  try {
    // 1. 최근 30일 verified 영수증의 product.barcode 수집 (사용자별)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userBarcodes = await prisma.receipt.findMany({
      where: {
        status: "verified",
        uploaderId: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        uploaderId: true,
        prices: {
          select: {
            product: { select: { id: true, name: true, barcode: true } },
            createdAt: true,
          },
        },
      },
    });

    // userId별로 (productId, barcode, name, lastSeenAt) 수집
    type UserItem = { productId: string; barcode: string; name: string; lastSeenAt: Date };
    const userMap = new Map<string, Map<string, UserItem>>();
    for (const r of userBarcodes) {
      if (!r.uploaderId) continue;
      let userItems = userMap.get(r.uploaderId);
      if (!userItems) {
        userItems = new Map();
        userMap.set(r.uploaderId, userItems);
      }
      for (const p of r.prices) {
        if (!p.product?.barcode) continue;
        const existing = userItems.get(p.product.barcode);
        if (!existing || p.createdAt > existing.lastSeenAt) {
          userItems.set(p.product.barcode, {
            productId: p.product.id,
            barcode: p.product.barcode,
            name: p.product.name,
            lastSeenAt: p.createdAt,
          });
        }
      }
    }

    // 2. 모든 사용자 product의 바코드 수집 → Recall.barcode 매칭
    const allBarcodes = new Set<string>();
    for (const items of userMap.values()) {
      for (const bc of items.keys()) allBarcodes.add(bc);
    }
    if (allBarcodes.size === 0) {
      return NextResponse.json({
        ok: true,
        message: "최근 30일 영수증 product에 바코드 없음",
        durationMs: Date.now() - startedAt,
      });
    }
    const recalls = await prisma.recall.findMany({
      where: { barcode: { in: Array.from(allBarcodes) } },
      select: {
        id: true,
        barcode: true,
        productName: true,
        manufacturer: true,
        reason: true,
        grade: true,
        registeredAt: true,
      },
    });
    const recallByBarcode = new Map<string, typeof recalls>();
    for (const r of recalls) {
      if (!r.barcode) continue;
      const arr = recallByBarcode.get(r.barcode) ?? [];
      arr.push(r);
      recallByBarcode.set(r.barcode, arr);
    }

    // 3. 사용자별 매칭 + 푸시 발송
    let usersChecked = 0;
    let totalMatches = 0;
    let pushed = 0;
    let pushFailed = 0;
    const expiredEndpoints: string[] = [];
    const matchedUsers: { userId: string; matches: number }[] = [];

    for (const [userId, items] of userMap) {
      usersChecked++;
      const userMatches: { item: UserItem; recall: (typeof recalls)[number] }[] = [];
      for (const [barcode, item] of items) {
        const matched = recallByBarcode.get(barcode);
        if (matched && matched.length > 0) {
          // 가장 최근 회수 1건만
          const latest = matched.sort(
            (a, b) => b.registeredAt.getTime() - a.registeredAt.getTime(),
          )[0];
          userMatches.push({ item, recall: latest });
        }
      }
      if (userMatches.length === 0) continue;

      totalMatches += userMatches.length;
      matchedUsers.push({ userId, matches: userMatches.length });

      // 푸시 발송
      const subs = await prisma.pushSubscription.findMany({
        where: { userId },
      });
      if (subs.length === 0) continue;

      const first = userMatches[0];
      const more = userMatches.length > 1 ? ` 외 ${userMatches.length - 1}건` : "";
      for (const sub of subs) {
        const r = await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          {
            title: `⚠️ 회수 대상 상품 발견`,
            body: `최근에 산 "${first.item.name}"이(가) 식약처 회수 대상이에요${more}.\n사유: ${first.recall.reason.slice(0, 80)}`,
            url: `/products/${first.item.productId}`,
          },
        );
        if (r.ok) {
          pushed++;
        } else {
          pushFailed++;
          if (r.gone) expiredEndpoints.push(sub.endpoint);
        }
      }
    }

    // 만료된 push 구독 정리
    if (expiredEndpoints.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: expiredEndpoints } },
      });
    }

    return NextResponse.json({
      ok: true,
      usersChecked,
      uniqueBarcodes: allBarcodes.size,
      recallsLoaded: recalls.length,
      totalMatches,
      affectedUsers: matchedUsers.length,
      pushed,
      pushFailed,
      expiredCleaned: expiredEndpoints.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    console.error("[cron/recall-check] 실패", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
