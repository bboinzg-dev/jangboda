import Link from "next/link";
import { prisma } from "@/lib/db";
import EmptyState from "@/components/EmptyState";
import CollapsibleList from "@/components/CollapsibleList";

// 1시간 ISR — 매주 금요일 갱신되는 공공 데이터.
export const revalidate = 3600;

// inspectDay(YYYYMMDD) → "YYYY-MM-DD" 표시
function formatInspectDay(d: string): string {
  if (!d || d.length !== 8) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export default async function ParsaProductDetailPage({
  params,
}: {
  params: Promise<{ goodId: string }>;
}) {
  const { goodId: goodIdRaw } = await params;
  const goodId = decodeURIComponent(goodIdRaw);

  // 상품 정보
  const product = await prisma.parsaProduct.findUnique({ where: { goodId } });

  if (!product) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-stone-900">상품을 찾을 수 없어요</h1>
        </header>
        <EmptyState
          icon="🔎"
          title="해당 상품 정보가 없습니다"
          description={
            <>
              요청하신 상품 ID에 해당하는 데이터를 찾지 못했습니다.
              <br />
              다른 상품을 검색해보세요.
            </>
          }
          actions={[{ href: "/parsa", label: "📊 공공 가격 정보로", primary: true }]}
        />
      </div>
    );
  }

  // 카테고리/단위 lookup
  const [smallCat, unitCat, buCats] = await Promise.all([
    product.goodSmlclsCode
      ? prisma.parsaCategory.findFirst({
          where: { classCode: "AL", code: product.goodSmlclsCode },
        })
      : null,
    product.goodTotalDivCode
      ? prisma.parsaCategory.findFirst({
          where: { classCode: "UT", code: product.goodTotalDivCode },
        })
      : null,
    prisma.parsaCategory.findMany({ where: { classCode: "BU" } }),
  ]);
  const buCatMap = new Map(buCats.map((c) => [c.code, c.codeName]));

  // 가격: 가장 최근 inspectDay만
  const latestPrice = await prisma.parsaPrice.findFirst({
    where: { goodId },
    orderBy: { inspectDay: "desc" },
    select: { inspectDay: true },
  });
  const inspectDay = latestPrice?.inspectDay ?? null;

  let prices: Array<{
    id: string;
    entpId: string;
    price: number;
    plusoneYn: boolean;
    discountYn: boolean;
  }> = [];
  let storeMap = new Map<
    string,
    {
      entpName: string;
      entpTypeCode: string | null;
      addrBasic: string | null;
      roadAddrBasic: string | null;
    }
  >();

  if (inspectDay) {
    prices = await prisma.parsaPrice.findMany({
      where: { goodId, inspectDay },
      orderBy: { price: "asc" },
      select: {
        id: true,
        entpId: true,
        price: true,
        plusoneYn: true,
        discountYn: true,
      },
    });
    if (prices.length > 0) {
      const entpIds = Array.from(new Set(prices.map((p) => p.entpId)));
      const stores = await prisma.parsaStore.findMany({
        where: { entpId: { in: entpIds } },
        select: {
          entpId: true,
          entpName: true,
          entpTypeCode: true,
          addrBasic: true,
          roadAddrBasic: true,
        },
      });
      storeMap = new Map(stores.map((s) => [s.entpId, s]));
    }
  }

  const unitText =
    product.goodTotalCnt && product.goodTotalDivCode
      ? `${product.goodTotalCnt}${unitCat?.codeName ?? product.goodTotalDivCode.toLowerCase()}`
      : product.detailMean ?? "";

  const minPrice = prices.length > 0 ? prices[0].price : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/parsa"
          className="text-xs text-stone-500 hover:text-stone-700"
        >
          ← 공공 가격 정보
        </Link>
      </div>

      <header className="card p-5 space-y-2">
        <h1 className="text-xl font-bold text-stone-900">
          {product.goodName}
        </h1>
        <div className="flex flex-wrap gap-2 text-xs">
          {smallCat && (
            <span className="px-2 py-1 rounded bg-brand-50 text-brand-700 font-medium">
              {smallCat.codeName}
            </span>
          )}
          {unitText && (
            <span className="px-2 py-1 rounded bg-stone-100 text-stone-600">
              {unitText}
            </span>
          )}
          {product.detailMean && product.detailMean !== unitText && (
            <span className="px-2 py-1 rounded bg-stone-100 text-stone-600">
              {product.detailMean}
            </span>
          )}
        </div>
        {minPrice !== null && (
          <div className="pt-2 text-sm">
            최저가{" "}
            <span className="text-lg font-bold text-brand-600">
              {minPrice.toLocaleString()}원
            </span>
          </div>
        )}
      </header>

      {prices.length === 0 ? (
        <EmptyState
          icon="📊"
          title="이 상품은 가격 데이터가 아직 없습니다"
          description={
            <>
              한국소비자원 참가격은 매주 금요일 갱신됩니다.
              <br />
              곧 가격 정보가 등록될 예정이에요.
            </>
          }
          actions={[
            { href: "/parsa", label: "다른 상품 둘러보기", primary: true },
          ]}
        />
      ) : (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-bold">💰 매장별 가격 비교</h2>
            {inspectDay && (
              <small className="text-xs text-stone-500">
                조사일: {formatInspectDay(inspectDay)}
              </small>
            )}
          </div>

          <CollapsibleList
            initialCount={5}
            as="ul"
            innerClassName="card overflow-hidden divide-y divide-stone-100"
          >
            {prices.map((p, i) => {
              const store = storeMap.get(p.entpId);
              const typeName = store?.entpTypeCode
                ? buCatMap.get(store.entpTypeCode) ?? store.entpTypeCode
                : null;
              const isLowest = i === 0;
              return (
                <li
                  key={p.id}
                  className={`p-3 flex justify-between items-center text-sm ${
                    isLowest ? "bg-brand-50/40" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isLowest && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-brand-500 text-white">
                          최저가
                        </span>
                      )}
                      <span className="font-medium text-stone-900 truncate">
                        {store?.entpName ?? p.entpId}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      {typeName && (
                        <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
                          {typeName}
                        </span>
                      )}
                      <span className="truncate">
                        {store?.roadAddrBasic ?? store?.addrBasic ?? ""}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="font-bold text-stone-900">
                      {p.price.toLocaleString()}원
                    </div>
                    <div className="flex gap-1 justify-end mt-0.5">
                      {p.plusoneYn && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                          1+1
                        </span>
                      )}
                      {p.discountYn && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          할인
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </CollapsibleList>
        </section>
      )}

      <footer className="text-[11px] text-stone-400 pt-2">
        출처: 한국소비자원 참가격(price.go.kr). 표시 가격은 조사 시점의 정보로
        실제 매장 가격과 다를 수 있습니다.
      </footer>
    </div>
  );
}
