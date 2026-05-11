// 관리자 대시보드 — 핵심 KPI + 최근 활동
import Link from "next/link";
import { prisma } from "@/lib/db";
import { kstNow } from "@/lib/kst";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return n.toLocaleString("ko-KR");
}

async function getStats() {
  const now = kstNow();
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 9 * 60 * 60 * 1000,
  );
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    userTotal,
    userMonth,
    receiptTotal,
    receipt7d,
    priceTotal,
    productTotal,
    storeTotal,
    benefitActive,
    matchTotal,
    pushSubs,
    recentReceipts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.receipt.count(),
    prisma.receipt.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.price.count(),
    prisma.product.count(),
    prisma.store.count(),
    prisma.benefit.count({ where: { active: true } }),
    prisma.benefitMatch.count(),
    prisma.pushSubscription.count(),
    prisma.receipt.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        status: true,
        store: { select: { name: true } },
        uploader: { select: { nickname: true } },
        _count: { select: { prices: true } },
      },
    }),
  ]);

  return {
    userTotal,
    userMonth,
    receiptTotal,
    receipt7d,
    priceTotal,
    productTotal,
    storeTotal,
    benefitActive,
    matchTotal,
    pushSubs,
    recentReceipts,
  };
}

export default async function AdminDashboard() {
  const s = await getStats();

  const cards = [
    { label: "전체 사용자", value: s.userTotal, sub: `이번 달 신규 ${fmt(s.userMonth)}` },
    { label: "푸시 구독", value: s.pushSubs, sub: "활성 단말 수" },
    { label: "영수증 (전체)", value: s.receiptTotal, sub: `최근 7일 ${fmt(s.receipt7d)}` },
    { label: "가격 데이터", value: s.priceTotal, sub: "Price 행 수" },
    { label: "상품 카탈로그", value: s.productTotal, sub: `매장 ${fmt(s.storeTotal)}곳` },
    { label: "정부혜택 (활성)", value: s.benefitActive, sub: `매칭 ${fmt(s.matchTotal)}건` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink-1">대시보드</h1>
        <p className="text-sm text-ink-3 mt-1">
          서비스 핵심 지표 — KST 기준
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="bg-surface border border-line rounded-xl p-4"
          >
            <div className="text-xs text-ink-3">{c.label}</div>
            <div className="text-2xl font-bold mt-1 text-ink-1">{fmt(c.value)}</div>
            <div className="text-xs text-ink-3 mt-1">{c.sub}</div>
          </div>
        ))}
      </section>

      <section className="bg-surface border border-line rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">최근 영수증</h2>
          <Link href="/admin/receipts" className="text-xs text-brand-600 hover:underline">
            전체 보기 →
          </Link>
        </div>
        {s.recentReceipts.length === 0 ? (
          <div className="text-sm text-ink-3 text-center py-6">
            등록된 영수증이 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {s.recentReceipts.map((r) => (
              <li key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink-1 truncate">
                    {r.store?.name ?? "(매장 미식별)"}
                  </div>
                  <div className="text-xs text-ink-3">
                    {r.uploader?.nickname ?? "(익명)"} · {r._count.prices}품목 ·{" "}
                    {r.createdAt.toLocaleDateString("ko-KR", {
                      timeZone: "Asia/Seoul",
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                    r.status === "verified"
                      ? "bg-success-soft text-success-text"
                      : r.status === "failed"
                      ? "bg-danger-soft text-danger-text"
                      : "bg-surface-muted text-ink-3"
                  }`}
                >
                  {r.status ?? "pending"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
