import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatWon, formatRelativeDate } from "@/lib/format";
import EmptyState from "@/components/EmptyState";

// /kamis — KAMIS 시세 전체 보기
// 홈 "오늘의 시세" ticker 의 "전체 보기" 도착지점.
// 검색 기능 + 정렬 (최신순/저렴순). server-rendered, ISR 1시간.
export const revalidate = 3600;

type SearchParams = { q?: string; sort?: string };

export default async function KamisPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const sort = sp.sort === "cheap" ? "cheap" : "fresh";

  // KAMIS 가격 — productId 별로 가장 최신 1건씩
  const allPrices = await prisma.price.findMany({
    where: {
      source: "kamis",
      ...(q
        ? {
            product: {
              OR: [
                { name: { contains: q } },
                { aliases: { some: { alias: { contains: q } } } },
              ],
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    distinct: ["productId"],
    take: 100,
    include: { product: true },
  });

  const sorted =
    sort === "cheap"
      ? [...allPrices].sort((a, b) => a.price - b.price)
      : allPrices;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold mb-1">📊 오늘의 시세</h1>
        <p className="text-sm text-stone-500">
          KAMIS(한국 농수산물유통공사) 공식 매일 평균 소매시세
        </p>
      </div>

      {/* 검색 + 정렬 */}
      <form
        method="get"
        className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center"
      >
        <input
          name="q"
          type="text"
          defaultValue={q}
          placeholder="상품명 검색 (예: 사과, 양파, 돼지고기)"
          className="input-base flex-1"
        />
        <input type="hidden" name="sort" value={sort} />
        <button type="submit" className="btn-primary sm:w-auto">
          🔍 검색
        </button>
      </form>

      <div className="flex gap-2 text-xs">
        <Link
          href={buildHref(q, "fresh")}
          className={`px-3 py-1.5 rounded-full border transition ${
            sort === "fresh"
              ? "bg-brand-500 text-white border-brand-500"
              : "bg-white text-stone-700 border-border hover:bg-stone-50"
          }`}
        >
          최신순
        </Link>
        <Link
          href={buildHref(q, "cheap")}
          className={`px-3 py-1.5 rounded-full border transition ${
            sort === "cheap"
              ? "bg-brand-500 text-white border-brand-500"
              : "bg-white text-stone-700 border-border hover:bg-stone-50"
          }`}
        >
          저렴한 순
        </Link>
      </div>

      {/* 결과 */}
      {sorted.length === 0 ? (
        <EmptyState
          illustration="/illustrations/empty-search.png"
          icon="📊"
          title={q ? `"${q}" 검색 결과가 없어요` : "오늘 등록된 시세가 아직 없어요"}
          description={
            <>
              KAMIS는 매일 갱신되며 평일 데이터가 가장 풍부합니다.
              <br />
              주말이라면 잠시 후 다시 확인해주세요.
            </>
          }
          actions={[{ href: "/", label: "홈으로 돌아가기" }]}
        />
      ) : (
        <>
          <div className="text-xs text-stone-500">
            총 {sorted.length}개 품목 시세 · 매일 갱신
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {sorted.map((p) => {
              const m = ((p as { metadata?: unknown }).metadata ?? null) as
                | { changeAmount?: number; changePct?: number }
                | null;
              const change = m?.changeAmount ?? null;
              const pct = m?.changePct ?? null;
              const isUp = change !== null && change > 0;
              const isDown = change !== null && change < 0;
              const colorClass = isUp
                ? "text-rose-600"
                : isDown
                ? "text-blue-600"
                : "text-stone-400";
              return (
                <Link
                  key={p.id}
                  href={`/products/${p.product.id}`}
                  className="card-clickable relative bg-white border border-border rounded-lg p-4 pr-8"
                >
                  <div className="text-xs text-stone-500 mb-0.5">
                    {p.product.category}
                  </div>
                  <div className="font-semibold text-stone-900 truncate">
                    {p.product.name}
                  </div>
                  <div className="text-xs text-stone-400 mb-2">
                    {p.product.unit}
                  </div>
                  <div className="text-lg font-bold text-brand-700">
                    {formatWon(p.price)}
                  </div>
                  {change !== null && pct !== null && (
                    <div className={`text-xs font-medium mt-0.5 ${colorClass}`}>
                      {isUp ? "▲" : isDown ? "▼" : "—"}{" "}
                      {Math.abs(change).toLocaleString("ko-KR")}원
                      <span className="ml-1">
                        ({pct >= 0 ? "+" : ""}
                        {pct.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                  <div className="text-[10px] text-stone-400 mt-1">
                    KAMIS · {formatRelativeDate(p.createdAt)}
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function buildHref(q: string, sort: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort && sort !== "fresh") params.set("sort", sort);
  const qs = params.toString();
  return qs ? `/kamis?${qs}` : "/kamis";
}
