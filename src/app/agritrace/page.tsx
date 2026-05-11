import Link from "next/link";
import { prisma } from "@/lib/db";
import Pagination from "@/components/Pagination";

export const revalidate = 3600;

// /agritrace — 농산물이력추적 검색/탐색 페이지
// ?q=품목명, ?orgn=농가명, ?page=N. 미지정 시 최근 등록 PAGE_SIZE 건.

type SearchParams = {
  q?: string;
  orgn?: string;
  page?: string;
};

type Partner = {
  grpName?: string;
  presidentName?: string;
  telno?: string;
};

const PAGE_SIZE = 20;

export default async function AgriTracePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const orgn = sp.orgn?.trim() ?? "";
  const page = Math.max(parseInt(sp.page ?? "1", 10) || 1, 1);

  const where: Record<string, unknown> = {};
  if (q) where.rprsntPrdltName = { contains: q };
  if (orgn) where.orgnName = { contains: orgn };

  let items: Awaited<ReturnType<typeof prisma.agriTrace.findMany>> = [];
  let total = 0;
  let dbError: string | null = null;
  try {
    const whereInput = Object.keys(where).length > 0 ? where : undefined;
    [items, total] = await Promise.all([
      prisma.agriTrace.findMany({
        where: whereInput,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.agriTrace.count({
        where: whereInput,
      }),
    ]);
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const safePage = Math.min(page, totalPages);
  const hasFilter = q.length > 0 || orgn.length > 0;

  // 페이지 링크 빌더 — 검색 query (q, orgn) 보존
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (orgn) params.set("orgn", orgn);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/agritrace?${qs}` : "/agritrace";
  };

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-sm text-ink-4 hover:underline">
          ← 홈으로
        </Link>
      </div>

      <header className="card p-5">
        <h1 className="text-xl font-bold flex items-center gap-2">
          🌱 농산물이력추적
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          식품안전나라(국립농산물품질관리원) 등록 농가/단체 검색
        </p>

        <form className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2" method="GET">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="품목명 (예: 사과, 배추, 쌀)"
            className="border border-line-strong rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="text"
            name="orgn"
            defaultValue={orgn}
            placeholder="농가/단체명"
            className="border border-line-strong rounded-lg px-3 py-2 text-sm"
          />
          <div className="md:col-span-2 flex gap-2">
            <button
              type="submit"
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
            >
              검색
            </button>
            {hasFilter && (
              <Link
                href="/agritrace"
                className="border border-line-strong hover:bg-surface-muted rounded-lg px-4 py-2 text-sm text-ink-3"
              >
                초기화
              </Link>
            )}
          </div>
        </form>
      </header>

      <section>
        <h2 className="font-bold mb-3 flex items-center gap-2">
          {hasFilter ? "🔍 검색 결과" : "🆕 최근 등록"}
          <span className="text-xs text-ink-4 font-normal">
            (총 {total.toLocaleString()}건)
          </span>
        </h2>

        {dbError && (
          <div className="bg-danger-soft border border-danger/30 text-danger-text rounded-lg p-3 text-sm">
            데이터를 불러오지 못했습니다: {dbError}
          </div>
        )}

        {!dbError && items.length === 0 && (
          <div className="bg-surface-muted border border-line rounded-lg p-6 text-center text-sm text-ink-4">
            {hasFilter
              ? "검색 결과가 없습니다. 다른 키워드로 시도해보세요."
              : "등록된 농산물이력추적 정보가 아직 없습니다."}
          </div>
        )}

        <ul className="space-y-2">
          {items.map((item) => {
            const partners = Array.isArray(item.partners)
              ? (item.partners as Partner[])
              : [];
            return (
              <li
                key={item.id}
                className="card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-ink-1">
                      {item.orgnName ?? "(농가명 미상)"}
                    </div>
                    <div className="text-sm text-ink-3 mt-0.5">
                      {item.rprsntPrdltName}
                      {item.presidentName ? ` · 대표 ${item.presidentName}` : ""}
                    </div>
                    {item.regInstName && (
                      <div className="text-xs text-ink-4 mt-1">
                        등록기관: {item.regInstName}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-ink-4 shrink-0 text-right">
                    <div className="font-mono">{item.histTraceRegNo}</div>
                    {item.validBeginDate && item.validEndDate && (
                      <div className="mt-0.5">
                        {item.validBeginDate} ~ {item.validEndDate}
                      </div>
                    )}
                  </div>
                </div>

                {partners.length > 0 && (
                  <details className="mt-3 group">
                    <summary className="text-xs text-ink-4 cursor-pointer hover:text-ink-2 select-none">
                      거래처 {partners.length}곳 보기
                    </summary>
                    <ul className="mt-2 text-xs text-ink-3 space-y-1 pl-2">
                      {partners.map((p, i) => (
                        <li key={i}>
                          <span className="font-medium">{p.grpName ?? "-"}</span>
                          {p.presidentName ? ` · ${p.presidentName}` : ""}
                          {p.telno ? ` · ${p.telno}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>

        <Pagination
          currentPage={safePage}
          totalPages={totalPages}
          buildHref={buildHref}
        />
      </section>
    </div>
  );
}
