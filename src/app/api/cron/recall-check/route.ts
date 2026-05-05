// Vercel Cron: 매 6시간 — 회수 식품 데이터 동기화 직후 사용자 영수증 product와 매칭
//
// 흐름:
// 1. 모든 활성 사용자의 receipt(verified)의 prices 안 product (id, barcode, name, manufacturer) 수집
// 2-A. 1순위 — Recall.barcode IN 매칭 (정확매칭)
// 2-B. 2순위(fallback) — Recall.barcode IS NULL 인 회수에 대해
//      정규화 manufacturer 정확일치 + 핵심 토큰 60%↑ 매칭
//      (식약처 회수 354건 중 38%가 barcode 누락 — 농수산물·소분식품)
// 3. 매칭된 사용자별 push 알림 발송 ("지난주에 산 OO이 식약처 회수 대상이에요")
// 4. 푸시 결과 + 매칭 통계 (정확/추정 분리) 반환
//
// 인증: Authorization: Bearer ${CRON_SECRET}
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import { sendPushNotification } from "@/lib/push";

// 제조사명 정규화 — "(주)농심" / "농심㈜" / "농심 주식회사" 동일하게.
function normMfr(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[()（）\[\]【】㈜주식회사\s.,\-_]/g, "")
    .replace(/co\.?ltd\.?|inc\.?|corp\.?/gi, "");
}

// 제품명 토큰화 — 2자 이상 토큰만 (조사/단위 노이즈 제거)
function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[()（）\[\]【】·,\-_/+]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

// recall 토큰 중 product에 들어있는 비율 (recall 기준 — 회수가 더 구체적임)
function tokenOverlap(recallName: string, productName: string): number {
  const rt = nameTokens(recallName);
  if (rt.length === 0) return 0;
  const ptSet = new Set(nameTokens(productName));
  let hit = 0;
  for (const t of rt) if (ptSet.has(t)) hit++;
  return hit / rt.length;
}

const NAME_OVERLAP_THRESHOLD = 0.6;

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  try {
    // 1. 최근 30일 verified 영수증의 product 수집 (사용자별)
    //    fallback 매칭을 위해 manufacturer까지 같이 가져옴
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

    // userId별로 product items 수집
    type UserItem = {
      productId: string;
      barcode: string | null;
      name: string;
      manufacturer: string | null;
      lastSeenAt: Date;
    };
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
        // productId를 키로 사용 — barcode 없는 product도 fallback 매칭 후보로 포함
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

    // 2. 매칭 후보 데이터 수집
    const allBarcodes = new Set<string>();
    const userManufacturersNorm = new Set<string>();
    for (const items of userMap.values()) {
      for (const it of items.values()) {
        if (it.barcode) allBarcodes.add(it.barcode);
        if (it.manufacturer) {
          const n = normMfr(it.manufacturer);
          if (n) userManufacturersNorm.add(n);
        }
      }
    }
    if (allBarcodes.size === 0 && userManufacturersNorm.size === 0) {
      return NextResponse.json({
        ok: true,
        message: "최근 30일 영수증 product에 바코드/제조사 정보 없음",
        durationMs: Date.now() - startedAt,
      });
    }

    // 2-A. barcode 정확매칭용 회수 + 2-B. fallback 매칭용 회수 (barcode 없는 회수)
    //      한 번의 쿼리로 둘 다 가져와서 메모리에서 분리 (DB 왕복 1회)
    const allRecalls = await prisma.recall.findMany({
      where: {
        OR: [
          { barcode: { in: Array.from(allBarcodes) } },
          // fallback 후보: barcode 없는 모든 회수 (제조사 비교는 메모리에서)
          // 회수 데이터는 354건 규모라 전체 로드 안전
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
    });
    type RecallRow = (typeof allRecalls)[number];
    const recallByBarcode = new Map<string, RecallRow[]>();
    const recallsNoBarcode: RecallRow[] = [];
    for (const r of allRecalls) {
      if (r.barcode) {
        const arr = recallByBarcode.get(r.barcode) ?? [];
        arr.push(r);
        recallByBarcode.set(r.barcode, arr);
      } else if (r.manufacturer) {
        recallsNoBarcode.push(r);
      }
    }

    // fallback용 — manufacturer(정규화) → 회수 리스트 인덱스
    const recallByMfrNorm = new Map<string, RecallRow[]>();
    for (const r of recallsNoBarcode) {
      const n = normMfr(r.manufacturer);
      if (!n) continue;
      // 사용자 product 제조사와 정확일치만 — 무관한 회수까지 토큰 비교하면 비용·오탐 ↑
      if (!userManufacturersNorm.has(n)) continue;
      const arr = recallByMfrNorm.get(n) ?? [];
      arr.push(r);
      recallByMfrNorm.set(n, arr);
    }

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
      const userMatches: {
        item: UserItem;
        recall: RecallRow;
        matchType: "exact" | "fuzzy";
        score?: number;
      }[] = [];
      const matchedRecallIds = new Set<string>(); // 같은 product에 중복 매칭 방지

      for (const item of items.values()) {
        // 2-A. barcode 정확매칭
        if (item.barcode) {
          const matched = recallByBarcode.get(item.barcode);
          if (matched && matched.length > 0) {
            const latest = matched
              .slice()
              .sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime())[0];
            userMatches.push({ item, recall: latest, matchType: "exact" });
            matchedRecallIds.add(latest.id);
            exactMatches++;
            continue; // 정확매칭 됐으면 fallback 건너뜀
          }
        }

        // 2-B. fallback — manufacturer 정규화 일치 + 토큰 60%↑
        if (item.manufacturer) {
          const mfrNorm = normMfr(item.manufacturer);
          if (!mfrNorm) continue;
          const candidates = recallByMfrNorm.get(mfrNorm);
          if (!candidates || candidates.length === 0) continue;

          let best: { recall: RecallRow; score: number } | null = null;
          for (const r of candidates) {
            if (matchedRecallIds.has(r.id)) continue;
            const score = tokenOverlap(r.productName, item.name);
            if (score >= NAME_OVERLAP_THRESHOLD) {
              if (!best || score > best.score) best = { recall: r, score };
            }
          }
          if (best) {
            userMatches.push({
              item,
              recall: best.recall,
              matchType: "fuzzy",
              score: best.score,
            });
            matchedRecallIds.add(best.recall.id);
            fuzzyMatches++;
          }
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

      // 정확매칭 우선 — fuzzy는 낮은 신뢰도라 알림 본문에서도 추정 표시
      const sorted = userMatches.slice().sort((a, b) => {
        if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
        return b.recall.registeredAt.getTime() - a.recall.registeredAt.getTime();
      });
      const first = sorted[0];
      const more = sorted.length > 1 ? ` 외 ${sorted.length - 1}건` : "";
      const titlePrefix =
        first.matchType === "exact" ? "⚠️ 회수 대상 상품 발견" : "⚠️ 회수 대상 추정 상품";
      const bodySuffix =
        first.matchType === "exact"
          ? ""
          : ` (제조사·제품명 매칭, 정확도 ${Math.round((first.score ?? 0) * 100)}%)`;
      for (const sub of subs) {
        const r = await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          {
            title: titlePrefix,
            body: `최근에 산 "${first.item.name}"이(가) 식약처 회수 대상이에요${more}.\n사유: ${first.recall.reason.slice(0, 80)}${bodySuffix}`,
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
      uniqueManufacturers: userManufacturersNorm.size,
      recallsLoaded: allRecalls.length,
      recallsWithBarcode: recallByBarcode.size,
      recallsNoBarcodeMfrMatched: recallByMfrNorm.size,
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
