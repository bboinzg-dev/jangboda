import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// 한국소비자원 참가격(parsa) 브라우즈/검색 페이지
// 1시간 ISR — 매주 금요일 갱신되는 공공 데이터 특성상 1시간 캐시면 충분.
export const revalidate = 3600;

// 업태 칩 (B2C 단순화 — 주요 4종만)
type TypeKey = "ALL" | "LM" | "SM" | "CS" | "DP";

const TYPE_LABEL: Record<TypeKey, string> = {
  ALL: "전체",
  LM: "대형마트",
  SM: "슈퍼마켓",
  CS: "편의점",
  DP: "백화점",
};

// 업태 코드 매핑 — DB의 ParsaCategory(BU)에서 codeName으로 ALL 매칭이 어렵기 때문에
// 코드로 직접 비교한다.
const TYPE_CODES: TypeKey[] = ["ALL", "LM", "SM", "CS", "DP"];

export default async function ParsaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const typeParam = (sp.type ?? "ALL").toUpperCase() as TypeKey;
  const type: TypeKey = TYPE_CODES.includes(typeParam) ? typeParam : "ALL";

  // 카테고리 lookup map (소분류, 업태)
  const [smallCats, buCats] = await Promise.all([
    prisma.parsaCategory.findMany({ where: { classCode: "AL" } }),
    prisma.parsaCategory.findMany({ where: { classCode: "BU" } }),
  ]);
  const smallCatMap = new Map(smallCats.map((c) => [c.code, c.codeName]));
  const buCatMap = new Map(buCats.map((c) => [c.code, c.codeName]));

  // 검색 결과 (q 있을 때만)
  let searchResults: Array<{
    goodId: string;
    goodName: string;
    goodSmlclsCode: string | null;
    goodTotalCnt: string | null;
    goodTotalDivCode: string | null;
    detailMean: string | null;
  }> = [];

  if (q) {
    const where: Prisma.ParsaProductWhereInput = {
      goodName: { contains: q, mode: "insensitive" },
    };
    searchResults = await prisma.parsaProduct.findMany({
      where,
      orderBy: { goodName: "asc" },
      take: 30,
      select: {
        goodId: true,
        goodName: true,
        goodSmlclsCode: true,
        goodTotalCnt: true,
        goodTotalDivCode: true,
        detailMean: true,
      },
    });
  }

  // 인기 카테고리 — 소분류(AL) 중에서 highCode가 있는 leaf 노드 위주로,
  // 카테고리별 상품 수가 많은 순으로 12개.
  // 단순화를 위해 모든 소분류 카테고리를 가져와 상품 수와 매핑.
  const productCountByCategory = await prisma.parsaProduct.groupBy({
    by: ["goodSmlclsCode"],
    _count: { _all: true },
  });
  const countMap = new Map(
    productCountByCategory
      .filter((g) => g.goodSmlclsCode)
      .map((g) => [g.goodSmlclsCode as string, g._count._all])
  );

  // 카테고리 카드 후보: 소분류(AL) 중 highCode!=null(leaf)을 우선, 상품 N개 이상.
  const popularCategories = smallCats
    .filter((c) => c.highCode && (countMap.get(c.code) ?? 0) > 0)
    .map((c) => ({
      code: c.code,
      name: c.codeName,
      count: countMap.get(c.code) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // 업태별 매장 통계
  const storesByType = await prisma.parsaStore.groupBy({
    by: ["entpTypeCode"],
    _count: { _all: true },
  });
  const totalStores = await prisma.parsaStore.count();

  // 업태 필터가 적용된 검색 결과 — q와 type이 동시에 있으면
  // ParsaPrice를 통해 매장 업태로 한 번 더 필터링한다.
  // 단순화: type 필터는 검색 결과에 적용하지 않고(상품은 매장에 종속되지 않음),
  // 안내 텍스트로만 표시. 가격 비교 페이지에서 업태별로 비교 가능.
  // (B2C 단순함 우선)

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
          📊 공공 가격 정보
        </h1>
        <p className="text-sm text-stone-600">
          한국소비자원이 매주 조사하는 {totalStores.toLocaleString()}개 매장의
          생필품 가격
        </p>
      </header>

      {/* 검색 */}
      <form action="/parsa" method="get" className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="상품명 검색 (예: 계란, 우유, 라면)"
          className="flex-1 px-4 py-2.5 rounded-lg border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        {type !== "ALL" && <input type="hidden" name="type" value={type} />}
        <button
          type="submit"
          className="px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium"
        >
          검색
        </button>
      </form>

      {/* 업태 칩 */}
      <nav className="flex gap-2 flex-wrap">
        {TYPE_CODES.map((k) => {
          const active = k === type;
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (k !== "ALL") params.set("type", k);
          const href = `/parsa${params.toString() ? "?" + params.toString() : ""}`;
          return (
            <Link
              key={k}
              href={href}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                active
                  ? "bg-brand-500 text-white border-brand-500"
                  : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
              }`}
            >
              {TYPE_LABEL[k]}
            </Link>
          );
        })}
      </nav>

      {/* 검색 결과 (q 있을 때만) */}
      {q && (
        <section>
          <h2 className="font-bold mb-3">
            🔍 &quot;{q}&quot; 검색 결과 ({searchResults.length}건)
          </h2>
          {searchResults.length === 0 ? (
            <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
              <div className="text-4xl mb-3">🔎</div>
              <h3 className="font-bold mb-1">검색 결과가 없어요</h3>
              <p className="text-sm text-stone-500">
                다른 키워드로 검색해보거나, 아래 인기 카테고리를 둘러보세요.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {searchResults.map((p) => {
                const catName = p.goodSmlclsCode
                  ? smallCatMap.get(p.goodSmlclsCode)
                  : null;
                const unit =
                  p.goodTotalCnt && p.goodTotalDivCode
                    ? `${p.goodTotalCnt}${p.goodTotalDivCode.toLowerCase()}`
                    : p.detailMean ?? "";
                return (
                  <Link
                    key={p.goodId}
                    href={`/parsa/products/${encodeURIComponent(p.goodId)}`}
                    className="card-clickable bg-white border border-stone-200 rounded-xl p-4 hover:border-brand-300 flex flex-col gap-1"
                  >
                    <div className="font-semibold text-stone-900 line-clamp-2">
                      {p.goodName}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      {catName && (
                        <span className="px-2 py-0.5 rounded bg-stone-100">
                          {catName}
                        </span>
                      )}
                      {unit && <span>{unit}</span>}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 인기 카테고리 (q 없을 때 기본 노출) */}
      {!q && popularCategories.length > 0 && (
        <section>
          <h2 className="font-bold mb-3">📂 인기 카테고리</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {popularCategories.map((c) => (
              <Link
                key={c.code}
                href={`/parsa?q=${encodeURIComponent(c.name)}`}
                className="card-clickable bg-white border border-stone-200 rounded-lg p-4 hover:border-brand-300 flex flex-col gap-1"
              >
                <div className="text-sm font-semibold text-stone-900">
                  {c.name}
                </div>
                <small className="text-xs text-stone-500">
                  상품 {c.count.toLocaleString()}개
                </small>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 매장 통계 */}
      <section>
        <h2 className="font-bold mb-3">🏪 참여 매장 통계</h2>
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <div className="text-sm text-stone-700 mb-3">
            전국{" "}
            <span className="font-bold text-brand-600">
              {totalStores.toLocaleString()}개
            </span>{" "}
            매장 가격 모니터링 중
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {storesByType
              .filter((s) => s.entpTypeCode)
              .sort((a, b) => b._count._all - a._count._all)
              .slice(0, 8)
              .map((s) => {
                const code = s.entpTypeCode as string;
                const name = buCatMap.get(code) ?? code;
                return (
                  <div
                    key={code}
                    className="bg-stone-50 rounded-lg p-3 text-center"
                  >
                    <div className="text-xs text-stone-500">{name}</div>
                    <div className="text-lg font-bold text-stone-800">
                      {s._count._all.toLocaleString()}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </section>

      <footer className="text-[11px] text-stone-400 pt-2">
        출처: 한국소비자원 참가격(price.go.kr). 매주 금요일 갱신.
      </footer>
    </div>
  );
}
