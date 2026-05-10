// 관리자 - 데이터 동기화 (cron 수동 트리거 + 마지막 sync 시각)
import { prisma } from "@/lib/db";
import SyncTriggerButton from "./_components/SyncTriggerButton";

export const dynamic = "force-dynamic";

export default async function AdminSyncPage() {
  const [latestBenefit, latestProduct, latestRecall] = await Promise.all([
    prisma.benefit.findFirst({
      orderBy: { lastSyncedAt: "desc" },
      select: { lastSyncedAt: true },
    }),
    prisma.product.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.recall.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }).catch(() => null),
  ]);

  const fmt = (d: Date | null | undefined) =>
    d
      ? d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
      : "—";

  const TRIGGERS = [
    {
      key: "sync-benefits",
      title: "정부혜택 동기화",
      desc: "GOV24, MSS, BIZINFO 4개 출처 — page 1만 (catch-up)",
      path: "/api/cron/sync-benefits",
      lastSync: fmt(latestBenefit?.lastSyncedAt),
    },
    {
      key: "normalize-benefits",
      title: "혜택 정형화 (LLM)",
      desc: "normalizedRules 비어있는 active 혜택 최대 30건 LLM 정형화",
      path: "/api/cron/normalize-benefits",
      lastSync: null,
    },
    {
      key: "stale-benefits",
      title: "만료 혜택 정리",
      desc: "마감 7일 경과 / 종료 키워드 / 60일 미동기화 → active=false",
      path: "/api/cron/stale-benefits",
      lastSync: null,
    },
    {
      key: "recall-check",
      title: "회수 식품 매칭",
      desc: "사용자 영수증 product와 식약처 회수 정보 매칭 → 푸시 알림",
      path: "/api/cron/recall-check",
      lastSync: fmt(latestRecall?.createdAt),
    },
    {
      key: "benefits-deadline",
      title: "혜택 마감 푸시",
      desc: "D-7 / D-30 임박 매칭 사용자에게 푸시 발송",
      path: "/api/cron/benefits-deadline",
      lastSync: null,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-ink-1">데이터 동기화</h1>
        <p className="text-sm text-ink-3 mt-1">
          cron 수동 트리거 — 결과는 응답 JSON으로 즉시 표시됩니다.
        </p>
      </div>

      <div className="bg-warning-soft border border-warning text-warning-text p-3 rounded-xl text-xs">
        ⚠️ 수동 실행 시 외부 API quota / LLM 비용을 직접 소모합니다. 자주 누르지 마세요.
      </div>

      <div className="space-y-3">
        {TRIGGERS.map((t) => (
          <div
            key={t.key}
            className="bg-white border border-line rounded-xl p-4 flex items-start justify-between gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-ink-1">{t.title}</div>
              <div className="text-xs text-ink-3 mt-0.5">{t.desc}</div>
              {t.lastSync && (
                <div className="text-xs text-ink-3 mt-1">
                  최근 데이터: {t.lastSync}
                </div>
              )}
            </div>
            <SyncTriggerButton path={t.path} label={t.title} />
          </div>
        ))}
      </div>

      <div className="text-xs text-ink-3 mt-4">
        모든 cron route는 Authorization: Bearer ${"{CRON_SECRET}"} 또는 동일 origin
        호출만 통과합니다 (src/lib/cronAuth.ts).
      </div>
    </div>
  );
}
