import Link from "next/link";
import { prisma } from "@/lib/db";

export const revalidate = 3600;

// /agritrace — 농산물이력추적 검색/탐색 페이지
// ?q=품목명, ?orgn=농가명. 미지정 시 최근 등록 20건.

type SearchParams = {
  q?: string;
  orgn?: string;
};

type Partner = {
  grpName?: string;
  presidentName?: string;
  telno?: string;
};

export default async function AgriTracePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = searchParams.q?.trim() ?? "";
  const orgn = searchParams.orgn?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (q) where.rprsntPrdltName = { contains: q };
  if (orgn) where.orgnName = { contains: orgn };

  let items: Awaited<ReturnType<typeof prisma.agriTrace.findMany>> = [];
  let dbError: string | null = null;
  try {
    items = await prisma.agriTrace.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const hasFilter = q.length > 0 || orgn.length > 0;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/" className="text-sm text-stone-500 hover:underline">
          ← 홈으로
        </Link>
      </div>

      <header className="bg-white border border-stone-200 rounded-xl p-5">
        <h1 className="text-xl font-bold flex items-center gap-2">
          🌱 농산물이력추적
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          식품안전나라(국립농산물품질관리원) 등록 농가/단체 검색
        </p>

        <form className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2" method="GET">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="품목명 (예: 사과, 배추, 쌀)"
            className="border border-stone-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="text"
            name="orgn"
            defaultValue={orgn}
            placeholder="농가/단체명"
            className="border border-stone-300 rounded-lg px-3 py-2 text-sm"
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
                className="border border-stone-300 hover:bg-stone-50 rounded-lg px-4 py-2 text-sm text-stone-600"
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
          <span className="text-xs text-stone-500 font-normal">
            ({items.length}건)
          </span>
        </h2>

        {dbError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            데이터를 불러오지 못했습니다: {dbError}
          </div>
        )}

        {!dbError && items.length === 0 && (
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-6 text-center text-sm text-stone-500">
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
                className="bg-white border border-stone-200 rounded-xl p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-stone-800">
                      {item.orgnName ?? "(농가명 미상)"}
                    </div>
                    <div className="text-sm text-stone-600 mt-0.5">
                      {item.rprsntPrdltName}
                      {item.presidentName ? ` · 대표 ${item.presidentName}` : ""}
                    </div>
                    {item.regInstName && (
                      <div className="text-xs text-stone-500 mt-1">
                        등록기관: {item.regInstName}
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-stone-400 shrink-0 text-right">
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
                    <summary className="text-xs text-stone-500 cursor-pointer hover:text-stone-700 select-none">
                      거래처 {partners.length}곳 보기
                    </summary>
                    <ul className="mt-2 text-xs text-stone-600 space-y-1 pl-2">
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
      </section>
    </div>
  );
}
