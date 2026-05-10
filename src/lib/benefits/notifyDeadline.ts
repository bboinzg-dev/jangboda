// 정부 혜택 마감 임박 푸시 알림 — D-7 / D-30 스캔 후 사용자별 묶음 발송
//
// 호출 진입점:
//   - Vercel Cron: /api/cron/benefits-deadline (매일 09:00 KST)
//   - 수동: curl -H "Authorization: Bearer $CRON_SECRET" https://localhost:3000/api/cron/benefits-deadline
//
// 정책:
//   - D-7 (오늘~7일): status in (matched, uncertain), 30일 내 미발송 (notifiedAt null OR 30일 이전)
//   - D-30 (8~30일): status = matched, score >= 70, notifiedAt null
//   - 사용자당 한 번에 최대 3건, 점수 내림차순
//   - 한 사용자 = 한 푸시 (구독 단말 수만큼 fan-out)
//   - 만료 구독(410/404)은 자동 정리

import { prisma } from "@/lib/db";
import { sendPushNotification } from "@/lib/push";
import { kstStartOfDay } from "@/lib/kst";

export interface NotifyDeadlineResult {
  scanned: number;
  notified: number; // 푸시 발송된 사용자 수
  sent: number; // 실제 발송 성공 push 건수 (구독 단말 단위)
  failed: number; // 발송 실패 건수
}

const MAX_BENEFITS_PER_USER = 3;
const MIN_SCORE_FOR_D30 = 70;
const RENOTIFY_AFTER_DAYS = 30;

interface MatchRow {
  id: string;
  score: number;
  status: string;
  benefit: {
    id: string;
    title: string;
    applyEndAt: Date | null;
  };
  profile: {
    userId: string;
    user: {
      id: string;
      pushSubs: Array<{ endpoint: string; p256dh: string; auth: string }>;
    };
  };
}

export async function notifyUpcomingDeadlines(): Promise<NotifyDeadlineResult> {
  const now = new Date();
  // KST 기준 오늘 00:00 (서버 UTC에서 호출돼도 한국 날짜로 D-N 산정)
  const startOfToday = kstStartOfDay(now);
  const d7End = new Date(startOfToday.getTime() + 8 * 24 * 60 * 60 * 1000 - 1); // +7일의 23:59:59.999
  const d30Start = new Date(startOfToday.getTime() + 8 * 24 * 60 * 60 * 1000);
  const d30End = new Date(startOfToday.getTime() + 31 * 24 * 60 * 60 * 1000 - 1);

  const renotifyCutoff = new Date(
    now.getTime() - RENOTIFY_AFTER_DAYS * 24 * 60 * 60 * 1000
  );

  // D-7 후보: matched | uncertain, applyEndAt ∈ [today, today+7], 미알림 또는 30일 전 알림
  const d7 = (await prisma.benefitMatch.findMany({
    where: {
      status: { in: ["matched", "uncertain"] },
      benefit: {
        active: true,
        applyEndAt: { gte: startOfToday, lte: d7End },
      },
      OR: [
        { notifiedAt: null },
        { notifiedAt: { lt: renotifyCutoff } },
      ],
    },
    select: {
      id: true,
      score: true,
      status: true,
      benefit: { select: { id: true, title: true, applyEndAt: true } },
      profile: {
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              pushSubs: {
                select: { endpoint: true, p256dh: true, auth: true },
              },
            },
          },
        },
      },
    },
  })) as MatchRow[];

  // D-30 후보: matched, applyEndAt ∈ [today+8, today+30], score >= 70, notifiedAt null
  const d30 = (await prisma.benefitMatch.findMany({
    where: {
      status: "matched",
      score: { gte: MIN_SCORE_FOR_D30 },
      notifiedAt: null,
      benefit: {
        active: true,
        applyEndAt: { gte: d30Start, lte: d30End },
      },
    },
    select: {
      id: true,
      score: true,
      status: true,
      benefit: { select: { id: true, title: true, applyEndAt: true } },
      profile: {
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              pushSubs: {
                select: { endpoint: true, p256dh: true, auth: true },
              },
            },
          },
        },
      },
    },
  })) as MatchRow[];

  // 사용자별로 묶기 (D-7 우선) — Map<userId, MatchRow[]>
  const byUser = new Map<string, MatchRow[]>();
  const pushOrUnique = (m: MatchRow) => {
    const uid = m.profile.userId;
    const list = byUser.get(uid) ?? [];
    if (list.find((x) => x.id === m.id)) return;
    list.push(m);
    byUser.set(uid, list);
  };
  d7.forEach(pushOrUnique);
  d30.forEach(pushOrUnique);

  const scanned = d7.length + d30.length;
  let notifiedUsers = 0;
  let sent = 0;
  let failed = 0;
  const expiredEndpoints: string[] = [];

  for (const [userId, allMatches] of byUser.entries()) {
    // 푸시 구독이 없으면 skip (notifiedAt도 갱신 안 함 — 다음 cron에 재시도)
    const subs = allMatches[0]?.profile.user.pushSubs ?? [];
    if (subs.length === 0) continue;

    // 점수 높은 순, 최대 3건
    const top = [...allMatches]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_BENEFITS_PER_USER);
    if (top.length === 0) continue;

    // 푸시 페이로드 구성
    const title =
      top.length === 1
        ? `정부 혜택이 곧 마감돼요`
        : `정부 혜택 ${top.length}개가 곧 마감돼요`;
    const previewTitles = top
      .slice(0, 2)
      .map((m) => m.benefit.title)
      .join(", ");
    const body =
      top.length <= 2
        ? previewTitles
        : `${previewTitles} 외 ${top.length - 2}건`;

    // 사용자의 모든 단말에 발송
    let anyOk = false;
    for (const sub of subs) {
      try {
        const r = await sendPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          {
            title,
            body,
            // 기존 push.ts payload 시그니처에 맞춰 url 전달.
            // 클릭 추적용 source 메타는 SW가 data 객체로 가공한다고 가정.
            url: `/benefits?source=deadline`,
          }
        );
        if (r.ok) {
          sent++;
          anyOk = true;
        } else {
          failed++;
          if (r.gone) expiredEndpoints.push(sub.endpoint);
        }
      } catch (e) {
        failed++;
        // 한 건 실패해도 다음 단말로 계속
        console.error(
          `[benefits/notifyDeadline] push 실패 user=${userId}`,
          e instanceof Error ? e.message : String(e)
        );
      }
    }

    // 적어도 한 단말 발송 성공한 경우에만 notifiedAt 갱신 (멱등성 + 재시도 여지)
    if (anyOk) {
      notifiedUsers++;
      try {
        await prisma.benefitMatch.updateMany({
          where: { id: { in: top.map((m) => m.id) } },
          data: { notifiedAt: new Date() },
        });
      } catch (e) {
        console.error(
          `[benefits/notifyDeadline] notifiedAt 갱신 실패 user=${userId}`,
          e instanceof Error ? e.message : String(e)
        );
      }
    }
  }

  // 만료된 구독 정리
  if (expiredEndpoints.length > 0) {
    try {
      await prisma.pushSubscription.deleteMany({
        where: { endpoint: { in: expiredEndpoints } },
      });
    } catch (e) {
      console.error(
        "[benefits/notifyDeadline] 만료 구독 정리 실패",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  return { scanned, notified: notifiedUsers, sent, failed };
}
