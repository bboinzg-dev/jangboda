import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatWon, formatRelativeDate, freshnessTag } from "@/lib/format";
import { unitPriceLabel } from "@/lib/units";
import SourceBadge from "@/components/SourceBadge";
import DirectionsButton from "@/components/DirectionsButton";
import ChainLogo from "@/components/ChainLogo";
import ProductImage from "@/components/ProductImage";
import { resolveStoreHours } from "@/lib/chainHours";
import { evaluateOpenStatus } from "@/lib/storeHours";

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

  // 단일 리스트로 정렬 (이름순) — 카테고리 그룹화 제거
  // (기존엔 product.category로 그룹화했으나 카테고리가 "참가격 등록 상품"/"사용자 등록"
  //  같은 출처 메타라 사용자에게 무의미한 분리였음. 가격은 모두 영수증 source라 동일.)
  const items = Array.from(latestByProduct.values()).sort((a, b) =>
    a.product.name.localeCompare(b.product.name),
  );

  return { store, items, isFallback };
}

export default async function StoreDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getStoreDetail(params.id);
  if (!data) return notFound();
  const { store, items, isFallback } = data;

  const cat = store.chain.category || "mart";
  const icon = CATEGORY_ICONS[cat] ?? "🛒";
  const label = CATEGORY_LABELS[cat] ?? "마트";
  const showDirections = store.lat > 0 && store.lng > 0;
  // 영업시간 — store.hours 우선, 없으면 체인 default (이마트 10:00~23:00 등)
  const resolvedHours = resolveStoreHours(store.hours, store.chain.name);
  const openStatus = evaluateOpenStatus(resolvedHours.hours);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stores" className="text-sm text-stone-500 hover:underline">
          ← 주변 마트로
        </Link>
      </div>

      <header className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6">
        <div className="flex items-center gap-4 sm:gap-5">
          <ChainLogo
            src={store.chain.logoUrl}
            name={store.chain.name}
            size={80}
          />
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full font-medium">
              <span>{icon}</span>
              <span>{label}</span>
              <span className="text-brand-300">·</span>
              <span>{store.chain.name}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-1.5 text-ink-1 leading-tight truncate">
              {store.name}
            </h1>
            <div className="text-stone-600 text-sm mt-1 truncate">{store.address}</div>
            {/* 영업시간 + "지금 영업 중?" 상태. chain default 사용 시 라벨 명시 */}
            {resolvedHours.hours && (
              <div className="mt-1 space-y-0.5">
                <div
                  className={`text-xs font-medium ${
                    openStatus.isOpen === true
                      ? "text-emerald-700"
                      : openStatus.isOpen === false
                        ? "text-rose-600"
                        : "text-stone-500"
                  }`}
                >
                  {openStatus.label}
                </div>
                {resolvedHours.source === "chain" && (
                  <div className="text-[10px] text-stone-400">
                    체인 평균 영업시간{resolvedHours.note ? ` · ${resolvedHours.note}` : ""}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* 우측 통계 카드 — 데스크톱: 우측 정렬, 모바일: 다음 줄 */}
          <div className="hidden sm:flex flex-col items-end shrink-0 border-l border-stone-200 pl-5">
            <div className="text-[11px] text-stone-500">
              {isFallback ? `${store.chain.name} 가격` : "등록 가격"}
            </div>
            <div className="text-3xl font-extrabold text-brand-600 tabular-nums leading-none mt-0.5">
              {items.length}
              <span className="text-base text-brand-500 font-bold ml-0.5">건</span>
            </div>
          </div>
        </div>

        {/* 모바일 통계 + 길찾기 — 좌우 배치 */}
        <div className="mt-4 flex items-center gap-3">
          <div className="sm:hidden">
            <div className="text-[11px] text-stone-500">
              {isFallback ? `${store.chain.name} 가격` : "등록 가격"}
            </div>
            <div className="text-2xl font-extrabold text-brand-600 tabular-nums">
              {items.length}<span className="text-base ml-0.5">건</span>
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
        <section>
          <h2 className="font-bold text-sm text-stone-700 mb-2">
            등록 가격 <span className="text-stone-400">({items.length}건)</span>
          </h2>
          <ul className="space-y-2">
            {items.map((p) => {
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
                      {p.product.barcode && (
                        <div className="text-[10px] text-stone-400 font-mono mt-0.5 truncate">
                          📦 {p.product.barcode}
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">{formatWon(lp)}</div>
                    {upl && (
                      <div className="text-[11px] text-stone-500">{upl}</div>
                    )}
                    {/* 최근 14일 이내 행사가 있으면 보조 표시 — "이 매장이 가끔 할인하는구나" 신호 */}
                    {p.paidPrice != null &&
                      p.paidPrice < lp &&
                      Date.now() - p.createdAt.getTime() <
                        14 * 24 * 60 * 60 * 1000 && (
                        <div className="mt-1 text-[11px] text-rose-600 font-medium">
                          💰 행사가 {formatWon(p.paidPrice)}
                          {p.promotionType ? ` (${p.promotionType})` : ""}
                        </div>
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
        </section>
      )}
    </div>
  );
}
