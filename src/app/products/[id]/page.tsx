import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatWon, formatRelativeDate, freshnessTag } from "@/lib/format";
import { notFound } from "next/navigation";
import SourceBadge from "@/components/SourceBadge";

export const dynamic = "force-dynamic";

async function getProductDetail(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { aliases: true },
  });
  if (!product) return null;

  const stores = await prisma.store.findMany({ include: { chain: true } });
  const rows = await Promise.all(
    stores.map(async (s) => {
      const latest = await prisma.price.findFirst({
        where: { productId: id, storeId: s.id },
        orderBy: { createdAt: "desc" },
      });
      return latest
        ? {
            storeId: s.id,
            storeName: s.name,
            chainName: s.chain.name,
            price: latest.price,
            updatedAt: latest.createdAt,
            source: latest.source,
          }
        : null;
    })
  );

  const prices = rows
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.price - b.price);

  return { product, prices };
}

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getProductDetail(params.id);
  if (!data) return notFound();
  const { product, prices } = data;

  const minPrice = prices[0]?.price;
  const maxPrice = prices[prices.length - 1]?.price;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/search" className="text-sm text-stone-500 hover:underline">
          ← 검색으로
        </Link>
      </div>

      <header className="bg-white border border-stone-200 rounded-xl p-6">
        <div className="text-xs text-stone-500">{product.category}</div>
        <h1 className="text-2xl font-bold mt-1">{product.name}</h1>
        <div className="text-stone-600 text-sm mt-1">
          {product.brand} · {product.unit}
        </div>
        {prices.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <PriceStat label="최저가" value={formatWon(minPrice!)} highlight />
            <PriceStat
              label="최고가"
              value={maxPrice ? formatWon(maxPrice) : "-"}
            />
            <PriceStat
              label="가격차"
              value={
                minPrice && maxPrice ? formatWon(maxPrice - minPrice) : "-"
              }
            />
          </div>
        )}
      </header>

      <section>
        <h2 className="font-bold mb-3">매장별 가격 (낮은 순)</h2>
        {prices.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-8 text-center text-stone-500">
            아직 등록된 가격이 없습니다.
            <br />
            <Link
              href="/upload"
              className="text-brand-600 hover:underline font-medium"
            >
              영수증 올리고 첫 가격 등록하기 →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {prices.map((p, i) => {
              const tag = freshnessTag(p.updatedAt);
              const savingsPct =
                minPrice && p.price > minPrice
                  ? Math.round(((p.price - minPrice) / minPrice) * 100)
                  : 0;
              return (
                <li
                  key={p.storeId}
                  className={`bg-white border rounded-lg p-4 flex items-center justify-between ${
                    i === 0 ? "border-brand-400 bg-brand-50/30" : "border-stone-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {i === 0 && (
                      <span className="bg-brand-500 text-white text-xs px-2 py-0.5 rounded-full">
                        최저가
                      </span>
                    )}
                    <div>
                      <div className="font-semibold">{p.chainName}</div>
                      <div className="text-xs text-stone-500">
                        {p.storeName}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-stone-900">
                      {formatWon(p.price)}
                    </div>
                    <div className="flex items-center gap-1 justify-end mt-0.5 flex-wrap">
                      <SourceBadge source={p.source} />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${tag.color}`}>
                        {tag.label}
                      </span>
                      <span className="text-xs text-stone-500">
                        {formatRelativeDate(p.updatedAt)}
                      </span>
                      {savingsPct > 0 && (
                        <span className="text-xs text-rose-500">
                          +{savingsPct}%
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function PriceStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        highlight ? "bg-brand-50 border border-brand-200" : "bg-stone-50"
      }`}
    >
      <div className="text-xs text-stone-500">{label}</div>
      <div
        className={`text-lg font-bold ${
          highlight ? "text-brand-600" : "text-stone-700"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
