// Vercel Cron: 매 6시간 — 회수 식품 데이터 동기화 직후 사용자 영수증 product와 매칭
//
// 흐름:
// 1. 최근 30일 verified 영수증의 prices 안 product (id, barcode, name, manufacturer) 수집
// 2-A. 1순위 — Recall.barcode IN 매칭 (정확매칭)
// 2-B. 2순위(fallback) — Recall.barcode IS NULL 인 회수에 대해
//      정규화 manufacturer 정확일치 + 핵심 토큰 60%↑ 매칭
//      (식약처 회수 354건 중 38%가 barcode 누락 — 농수산물·소분식품)
// 3. 매칭된 사용자별 push 알림 발송
// 4. 푸시 결과 + 매칭 통계 (정확/추정 분리) 반환
//
// 매칭 알고리즘(normMfr, tokenOverlap, matchUserItems, push payload 빌더)은
// src/lib/recalls/match.ts 로 분리 — 이 파일은 orchestration만 담당.
//
// 인증: Authorization: Bearer ${CRON_SECRET}
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import { sendPushNotification } from "@/lib/push";
import { logError, logCronFailure } from "@/lib/observability";
import {
  buildRecallPushPayload,
  indexRecalls,
  matchUserItems,
  normMfr,
  type RecallRow,
  type UserItem,
} from "@/lib/recalls/match";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  try {
    // 1. 최근 30일 verified 영수증의 product 수집 (사용자별)
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
            product: {
              select: { id: true, name: true, barcode: true, manufacturer: true },
            },
            createdAt: true,
          },
        },
      },
    });

    // userId별로 product items 수집 — 같은 product 중복 시 최근 등록만 유지
    const userMap = new Map<string, Map<string, UserItem>>();
    for (const r of userBarcodes) {
      if (!r.uploaderId) continue;
      let userItems = userMap.get(r.uploaderId);
      if (!userItems) {
        userItems = new Map();
        userMap.set(r.uploaderId, userItems);
      }
      for (const p of r.prices) {
        if (!p.product) continue;
        const key = p.product.id;
        const existing = userItems.get(key);
        if (!existing || p.createdAt > existing.lastSeenAt) {
          userItems.set(key, {
            productId: p.product.id,
            barcode: p.product.barcode,
            name: p.product.name,
            manufacturer: p.product.manufacturer,
            lastSeenAt: p.createdAt,
          });
        }
      }
    }

    // 2. 매칭 후보 키 수집
    const allBarcodes = new Set<string>();
    const userMfrNorm = new Set<string>();
    for (const items of userMap.values()) {
      for (const it of items.values()) {
        if (it.barcode) allBarcodes.add(it.barcode);
        if (it.manufacturer) {
          const n = normMfr(it.manufacturer);
          if (n) userMfrNorm.add(n);
        }
      }
    }
    if (allBarcodes.size === 0 && userMfrNorm.size === 0) {
      return NextResponse.json({
        ok: true,
        message: "최근 30일 영수증 product에 바코드/제조사 정보 없음",
        durationMs: Date.now() - startedAt,
      });
    }

    // barcode 정확매칭용 + fallback용(barcode 없는 회수, 354건 규모라 전체 안전) 한 번에 로드
    const allRecalls = (await prisma.recall.findMany({
      where: {
        OR: [
          { barcode: { in: Array.from(allBarcodes) } },
          { barcode: null, manufacturer: { not: null } },
        ],
      },
      select: {
        id: true,
        barcode: true,
        productName: true,
        manufacturer: true,
        reason: true,
        grade: true,
        registeredAt: true,
      },
    })) as RecallRow[];

    const { byBarcode, byMfrNorm } = indexRecalls(allRecalls, userMfrNorm);

    // 3. 사용자별 매칭 + 푸시 발송
    let usersChecked = 0;
    let totalMatches = 0;
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let pushed = 0;
    let pushFailed = 0;
    const expiredEndpoints: string[] = [];
    const matchedUsers: { userId: string; matches: number }[] = [];

    for (const [userId, items] of userMap) {
      usersChecked++;
      const userMatches = matchUserItems(items.values(), byBarcode, byMfrNorm);
      if (userMatches.length === 0) continue;

      totalMatches += userMatches.length;
      for (const m of userMatches) {
        if (m.matchType === "exact") exactMatches++;
        else fuzzyMatches++;
      }
      matchedUsers.push({ userId, matches: userMatches.length });

      const payload = buildRecallPushPayload(userMatches);
      if (!payload) continue;

      const subs = await prisma.pushSubscription.findMany({ where: { userId } });
      if (subs.length === 0) continue;

      for (const sub of subs) {
        const r = await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
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
      uniqueManufacturers: userMfrNorm.size,
      recallsLoaded: allRecalls.length,
      recallsWithBarcode: byBarcode.size,
      recallsNoBarcodeMfrMatched: byMfrNorm.size,
      totalMatches,
      exactMatches,
      fuzzyMatches,
      affectedUsers: matchedUsers.length,
      pushed,
      pushFailed,
      expiredCleaned: expiredEndpoints.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    logCronFailure("cron/recall-check", e, {
      durationMs: Date.now() - startedAt,
    });
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
