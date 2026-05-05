import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatWon, formatRelativeDate, freshnessTag } from "@/lib/format";
import { unitPriceLabel } from "@/lib/units";
import SourceBadge from "@/components/SourceBadge";
import DirectionsButton from "@/components/DirectionsButton";
import ChainLogo from "@/components/ChainLogo";
import ProductImage from "@/components/ProductImage";

export const revalidate = 60;

const CATEGORY_ICONS: Record<string, string> = {
  mart: "🛒",
  convenience: "🏪",
  online: "📦",
  public: "📊",
};

const CATEGORY_LABELS: Record<string, string> = {
  mart: "마트",
  convenience: "편의점",
  online: "온라인",
  public: "시세",
};

async function getStoreDetail(id: string) {
  const store = await prisma.store.findUnique({
    where: { id },
    include: { chain: true },
  });
  if (!store) return null;

  // 이 매장에 등록된 모든 가격 — 같은 (productId, source)에 대해 최신 1건씩
  const allPrices = await prisma.price.findMany({
    where: { storeId: id },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  // 매장 직접 가격이 없으면 같은 chain의 다른 매장 가격 fallback
  // (참가격 데이터는 본사 대표매장에만 매핑되어 있어 일반 지점이 0건인 경우 多)
  let isFallback = false;
  let pricesToUse = allPrices;
  if (allPrices.length === 0) {
    const chainPrices = await prisma.price.findMany({
      where: {
        store: { chainId: store.chainId },
        NOT: { storeId: id },
      },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });
    pricesToUse = chainPrices;
    isFallback = chainPrices.length > 0;
  }

  // productId 별 최신 1건만 (같은 상품 여러 가격이 쌓여있어도)
  const latestByProduct = new Map<string, typeof pricesToUse[number]>();
  for (const p of pricesToUse) {
    if (!latestByProduct.has(p.productId)) {
      latestByProduct.set(p.productId, p);
    }
  }

  // 카테고리별로 그룹
  const items = Array.from(latestByProduct.values());
  const byCategory = new Map<string, typeof items>();
  for (const it of items) {
    const cat = it.product.category;
    const arr = byCategory.get(cat) ?? [];
    arr.push(it);
    byCategory.set(cat, arr);
  }
  const categories = Array.from(byCategory.entries()).map(([cat, list]) => ({
    category: cat,
    items: list.sort((a, b) => a.product.name.localeCompare(b.product.name)),
  }));

  return { store, items, categories, isFallback };
}

export default async function StoreDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getStoreDetail(params.id);
  if (!data) return notFound();
  const { store, items, categories, isFallback } = data;

  const cat = store.chain.category || "mart";
  const icon = CATEGORY_ICONS[cat] ?? "🛒";
  const label = CATEGORY_LABELS[cat] ?? "마트";
  const showDirections = store.lat > 0 && store.lng > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stores" className="text-sm text-stone-500 hover:underline">
          ← 주변 마트로
        </Link>
      </div>

      <header className="bg-white border border-stone-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <ChainLogo
            src={store.chain.logoUrl}
            name={store.chain.name}
            size={48}
          />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-brand-600 font-medium flex items-center gap-1">
              <span>{icon}</span>
              <span>{label}</span>
              <span className="text-stone-300">·</span>
              <span>{store.chain.name}</span>
            </div>
            <h1 className="text-2xl font-bold mt-1">{store.name}</h1>
            <div className="text-stone-600 text-sm mt-1">{store.address}</div>
          </div>
        </div>
        {store.hours && (
          <div className="text-stone-500 text-xs mt-1">영업시간: {store.hours}</div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <div>
            <div className="text-xs text-stone-500">
              {isFallback ? `같은 ${store.chain.name} 가격` : "등록 가격"}
            </div>
            <div className="text-2xl font-bold text-brand-600">
              {items.length}건
            </div>
          </div>
          {showDirections && (
            <div className="ml-auto">
              <DirectionsButton name={store.name} lat={store.lat} lng={store.lng} />
            </div>
          )}
        </div>
        {isFallback && (
          <div className="mt-3 text-xs bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-amber-800">
            이 매장의 직접 등록 가격은 없어, 같은{" "}
            <strong>{store.chain.name}</strong> 다른 매장의 참고 가격을 보여드립니다.
            지점별 가격 차이가 있을 수 있어요.
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-lg p-8 text-center text-stone-500 text-sm">
          이 매장에 등록된 가격이 아직 없습니다.
          <br />
          <Link href="/upload" className="text-brand-600 hover:underline mt-2 inline-block">
            영수증을 올려 첫 가격을 등록해보세요 →
          </Link>
        </div>
      ) : (
        <section className="space-y-6">
          {categories.map(({ category, items: catItems }) => (
            <div key={category}>
              <h2 className="font-bold text-sm text-stone-700 mb-2">
                {category} <span className="text-stone-400">({catItems.length})</span>
              </h2>
              <ul className="space-y-2">
                {catItems.map((p) => {
                  const tag = freshnessTag(p.createdAt);
                  const lp = p.listPrice ?? 0;
                  const upl = unitPriceLabel(lp, p.product.unit);
                  // 영수증 거래일 절대 날짜 (Price.createdAt = 영수증 거래일)
                  const dateStr = p.createdAt.toLocaleDateString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    weekday: "short",
                  });
                  const isReceipt = p.source === "receipt";
                  return (
                    <li
                      key={p.id}
                      className="bg-white border border-stone-200 rounded-lg p-4 flex justify-between items-center gap-3"
                    >
                      <Link
                        href={`/products/${p.product.id}`}
                        className="min-w-0 flex-1 hover:underline flex items-center gap-3"
                      >
                        <ProductImage
                          src={p.product.imageUrl}
                          alt={p.product.name}
                          size={48}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium leading-snug line-clamp-2 text-ink-1">
                            {p.product.name}
                          </div>
                          <div className="text-xs text-stone-500 truncate mt-0.5">
                            {p.product.unit}
                            {p.product.brand ? ` · ${p.product.brand}` : ""}
                          </div>
                        </div>
                      </Link>
                      <div className="text-right shrink-0">
                        <div className="font-semibold">{formatWon(lp)}</div>
                        {upl && (
                          <div className="text-[11px] text-stone-500">{upl}</div>
                        )}
                        <div className="flex gap-1 justify-end items-center mt-0.5 flex-wrap">
                          <SourceBadge source={p.source} />
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${tag.color}`}
                          >
                            {tag.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-500 mt-0.5">
                          {isReceipt ? "🧾 영수증 거래일 " : ""}
                          <span className="font-medium tabular-nums">{dateStr}</span>
                          <span className="text-stone-400 ml-1">
                            ({formatRelativeDate(p.createdAt)})
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
