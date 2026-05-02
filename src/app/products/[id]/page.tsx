import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatWon, formatRelativeDate, freshnessTag } from "@/lib/format";
import { notFound } from "next/navigation";
import SourceBadge, { isOnlineStore } from "@/components/SourceBadge";
import { unitPriceLabel } from "@/lib/units";

export const dynamic = "force-dynamic";

type PriceRow = {
  storeId: string;
  storeName: string;
  chainName: string;
  lat: number;
  lng: number;
  price: number;
  updatedAt: Date;
  source: string;
  online: boolean;
};

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
      if (!latest) return null;
      const row: PriceRow = {
        storeId: s.id,
        storeName: s.name,
        chainName: s.chain.name,
        lat: s.lat,
        lng: s.lng,
        price: latest.price,
        updatedAt: latest.createdAt,
        source: latest.source,
        online: isOnlineStore({
          lat: s.lat,
          lng: s.lng,
          name: s.name,
          chainName: s.chain.name,
        }),
      };
      return row;
    })
  );

  const valid = rows.filter((x): x is PriceRow => x !== null);
  return { product, prices: valid };
}

function PriceList({
  rows,
  unit,
  emptyHint,
}: {
  rows: PriceRow[];
  unit: string;
  emptyHint: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-lg p-6 text-center text-stone-500 text-sm">
        {emptyHint}
      </div>
    );
  }
  const sorted = [...rows].sort((a, b) => a.price - b.price);
  const minPrice = sorted[0].price;

  return (
    <ul className="space-y-2">
      {sorted.map((p, i) => {
        const tag = freshnessTag(p.updatedAt);
        const savingsPct =
          p.price > minPrice ? Math.round(((p.price - minPrice) / minPrice) * 100) : 0;
        return (
          <li
            key={p.storeId}
            className={`bg-white border rounded-lg p-4 flex items-center justify-between ${
              i === 0 ? "border-brand-400 bg-brand-50/30" : "border-stone-200"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {i === 0 && (
                <span className="bg-brand-500 text-white text-xs px-2 py-0.5 rounded-full shrink-0">
                  최저가
                </span>
              )}
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.chainName}</div>
                <div className="text-xs text-stone-500 truncate">{p.storeName}</div>
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <div className="text-lg font-bold text-stone-900">
                {formatWon(p.price)}
              </div>
              {(() => {
                const upl = unitPriceLabel(p.price, unit);
                return upl ? (
                  <div className="text-[11px] text-stone-500 -mt-0.5">{upl}</div>
                ) : null;
              })()}
              <div className="flex items-center gap-1 justify-end mt-0.5 flex-wrap">
                <SourceBadge source={p.source} />
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${tag.color}`}>
                  {tag.label}
                </span>
                <span className="text-xs text-stone-500">
                  {formatRelativeDate(p.updatedAt)}
                </span>
                {savingsPct > 0 && (
                  <span className="text-xs text-rose-500">+{savingsPct}%</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getProductDetail(params.id);
  if (!data) return notFound();
  const { product, prices } = data;

  const offlineRows = prices.filter((p) => !p.online);
  const onlineRows = prices.filter((p) => p.online);

  const allPrices = prices.map((p) => p.price).filter((x) => x > 0);
  const minPrice = allPrices.length > 0 ? Math.min(...allPrices) : 0;
  const maxPrice = allPrices.length > 0 ? Math.max(...allPrices) : 0;
  const winnerSection =
    offlineRows.length > 0 && onlineRows.length > 0
      ? Math.min(...offlineRows.map((r) => r.price)) <
        Math.min(...onlineRows.map((r) => r.price))
        ? "offline"
        : "online"
      : null;

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
            <PriceStat label="전체 최저가" value={formatWon(minPrice)} highlight />
            <PriceStat label="전체 최고가" value={formatWon(maxPrice)} />
            <PriceStat label="가격차" value={formatWon(maxPrice - minPrice)} />
          </div>
        )}

        {winnerSection && (
          <div className="mt-4 text-sm bg-brand-50 border border-brand-200 rounded-lg p-3">
            💡{" "}
            {winnerSection === "offline"
              ? "오프라인 매장이 더 쌉니다 — 가까우면 직접 사러 가는 게 이득"
              : "온라인이 더 쌉니다 — 시키는 게 이득 (배송비 별도 확인)"}
          </div>
        )}
      </header>

      <section>
        <h2 className="font-bold mb-3 flex items-center gap-2">
          🛒 오프라인 매장
          <span className="text-xs text-stone-500 font-normal">
            ({offlineRows.length}개 매장, 낮은 순)
          </span>
        </h2>
        <PriceList
          unit={product.unit}
          rows={offlineRows}
          emptyHint={
            <>
              아직 등록된 오프라인 가격이 없습니다.
              <br />
              <Link
                href="/upload"
                className="text-brand-600 hover:underline font-medium"
              >
                영수증 올리고 첫 가격 등록하기 →
              </Link>
            </>
          }
        />
      </section>

      <section>
        <h2 className="font-bold mb-3 flex items-center gap-2">
          📦 온라인 쇼핑몰
          <span className="text-xs text-stone-500 font-normal">
            ({onlineRows.length}개 몰, 낮은 순)
          </span>
        </h2>
        <PriceList
          unit={product.unit}
          rows={onlineRows}
          emptyHint={
            <>
              아직 등록된 온라인 가격이 없습니다.
              <br />
              <Link
                href="/sync"
                className="text-brand-600 hover:underline font-medium"
              >
                네이버 쇼핑 동기화로 한 번에 가져오기 →
              </Link>
            </>
          }
        />
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
