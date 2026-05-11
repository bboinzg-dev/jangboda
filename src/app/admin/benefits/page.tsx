// 관리자 - 정부혜택 카탈로그 (출처별 카운트, 만료/활성 상태, normalize 상태)
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { kstNow } from "@/lib/kst";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function AdminBenefitsPage({
  searchParams,
}: {
  searchParams: { page?: string; source?: string; q?: string };
}) {
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const source = (searchParams.source ?? "").trim();
  const q = (searchParams.q ?? "").trim();
  const skip = (page - 1) * PAGE_SIZE;

  const where = {
    ...(source ? { sourceCode: source } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [items, total, sourceCounts, activeCount, normalizedCount] = await Promise.all([
    prisma.benefit.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: { lastSyncedAt: "desc" },
      select: {
        id: true,
        title: true,
        sourceCode: true,
        agency: true,
        targetType: true,
        active: true,
        applyEndAt: true,
        normalizedRules: true,
        lastSyncedAt: true,
        _count: { select: { matches: true } },
      },
    }),
    prisma.benefit.count({ where }),
    prisma.benefit.groupBy({
      by: ["sourceCode"],
      _count: true,
      orderBy: { _count: { sourceCode: "desc" } },
    }),
    prisma.benefit.count({ where: { active: true } }),
    prisma.benefit.count({ where: { normalizedRules: { not: Prisma.JsonNull } } }).catch(() => 0),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = kstNow();

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-ink-1">정부혜택</h1>
        <span className="text-sm text-ink-3">
          총 {total.toLocaleString()}건 · 활성 {activeCount.toLocaleString()}건
          {normalizedCount > 0 && ` · 정형화 ${normalizedCount.toLocaleString()}건`}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/benefits"
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
            !source
              ? "bg-stone-900 text-white border-stone-900"
              : "bg-surface border-line text-ink-2 hover:bg-surface-muted"
          }`}
        >
          전체
        </Link>
        {sourceCounts.map((s) => (
          <Link
            key={s.sourceCode}
            href={`/admin/benefits?source=${s.sourceCode}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              source === s.sourceCode
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-surface border-line text-ink-2 hover:bg-surface-muted"
            }`}
          >
            {s.sourceCode}{" "}
            <span className="text-ink-3">({s._count.toLocaleString()})</span>
          </Link>
        ))}
      </div>

      <form method="get" action="/admin/benefits" className="flex gap-2">
        <input type="hidden" name="source" value={source} />
        <input
          name="q"
          defaultValue={q}
          placeholder="제목 검색"
          className="flex-1 px-3 py-2 border border-line rounded-lg text-sm"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium"
        >
          검색
        </button>
      </form>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <ul className="divide-y divide-line">
          {items.map((b) => {
            const expired = b.applyEndAt ? b.applyEndAt.getTime() < now.getTime() : false;
            return (
              <li key={b.id} className="p-3 hover:bg-surface-muted">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/benefits/${b.id}`}
                      target="_blank"
                      className="font-medium text-ink-1 hover:text-brand-600"
                    >
                      {b.title}
                    </Link>
                    <div className="text-xs text-ink-3 mt-0.5 truncate">
                      {b.agency ?? "-"} · {b.sourceCode}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 text-[11px]">
                    {!b.active && (
                      <span className="bg-surface-sunken text-ink-2 px-2 py-0.5 rounded font-bold">
                        비활성
                      </span>
                    )}
                    {expired && (
                      <span className="bg-danger-soft text-danger-text px-2 py-0.5 rounded font-bold">
                        마감
                      </span>
                    )}
                    {b.normalizedRules && (
                      <span className="bg-brand-soft text-brand-700 px-2 py-0.5 rounded font-bold">
                        정형화
                      </span>
                    )}
                    <span className="text-ink-3">매칭 {b._count.matches}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-1 text-sm">
          {page > 1 && (
            <Link
              href={`/admin/benefits?source=${source}&q=${encodeURIComponent(q)}&page=${page - 1}`}
              className="px-3 py-1.5 border border-line rounded hover:bg-surface-muted"
            >
              이전
            </Link>
          )}
          <span className="px-3 py-1.5 text-ink-3">
            {page} / {lastPage}
          </span>
          {page < lastPage && (
            <Link
              href={`/admin/benefits?source=${source}&q=${encodeURIComponent(q)}&page=${page + 1}`}
              className="px-3 py-1.5 border border-line rounded hover:bg-surface-muted"
            >
              다음
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

