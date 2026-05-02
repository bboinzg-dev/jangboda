import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatWon } from "@/lib/format";
import { notFound } from "next/navigation";
import { isOnlineStore } from "@/components/SourceBadge";
import PriceAlertButton from "@/components/PriceAlertButton";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import PriceListClient, { type PriceRowData } from "@/components/PriceListClient";
import EmptyState from "@/components/EmptyState";
import IngredientsPanel from "@/components/IngredientsPanel";
import NutritionPanel from "@/components/NutritionPanel";

export const revalidate = 30;

type PriceRow = PriceRowData;

type HistoryPoint = {
  date: Date;
  price: number;
  chainName: string;
};

async function getProductDetail(id: string) {
  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { aliases: true },
    });
    if (!product) return null;

    // 한 번의 쿼리로 이 productId의 모든 가격 가져오기 (N+1 회피)
    // store 정보는 join으로 같이. take 5000 제한 (메모리 보호)
    const allPrices = await prisma.price.findMany({
      where: { productId: id },
      include: { store: { include: { chain: true } } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    // storeId별로 그룹 — 가장 최근 가격 + 등록 횟수 + 최신 날짜
    type Aggregate = {
      latestPrice: (typeof allPrices)[number];
      count: number;
      latestDate: Date;
    };
    const byStore = new Map<string, Aggregate>();
    for (const p of allPrices) {
      // store 또는 chain이 어떤 이유로든 null이면 skip (방어)
      if (!p.store || !p.store.chain) continue;
      const cur = byStore.get(p.storeId);
      if (!cur) {
        byStore.set(p.storeId, { latestPrice: p, count: 1, latestDate: p.createdAt });
      } else {
        cur.count += 1;
        if (p.createdAt > cur.latestDate) cur.latestDate = p.createdAt;
      }
    }

    const valid: PriceRow[] = [];
    for (const { latestPrice: p, count, latestDate } of byStore.values()) {
      const chainName = p.store?.chain?.name ?? "(미상)";
      valid.push({
        priceId: p.id,
        storeId: p.storeId,
        storeName: p.store?.name ?? "(미상)",
        chainName,
        lat: p.store?.lat ?? 0,
        lng: p.store?.lng ?? 0,
        price: p.price,
        updatedAt: p.createdAt,
        source: p.source,
        productUrl: p.productUrl,
        online: isOnlineStore({
          lat: p.store?.lat ?? 0,
          lng: p.store?.lng ?? 0,
          name: p.store?.name ?? "",
          chainName,
        }),
        trust: { count, latestDate },
      });
    }

    // 가격 추이용 history — 최근 60일, source != 'naver'
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const history: HistoryPoint[] = allPrices
      .filter(
        (p) =>
          p.store?.chain &&
          p.source !== "naver" &&
          p.createdAt.getTime() >= sixtyDaysAgo
      )
      .slice(-200) // 그래프 점 200개 limit (렌더 보호)
      .map((p) => ({
        date: p.createdAt,
        price: p.price,
        chainName: p.store?.chain?.name ?? "(미상)",
      }))
      .reverse();

    return { product, prices: valid, history };
  } catch (e) {
    console.error("[products/[id]] getProductDetail error:", {
      productId: id,
      error: e instanceof Error ? { message: e.message, stack: e.stack } : e,
    });
    throw e; // 에러 가시화 위해 다시 throw — error.tsx가 잡음
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const data = await getProductDetail(params.id);
  if (!data) return notFound();
  const { product, prices, history } = data;

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
        <h1 className="text-2xl font-bold mt-1 flex items-center gap-2 flex-wrap">
          {product.name}
          {product.hasHaccp && (
            <span
              className="inline-flex items-center rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-xs font-medium"
              title="HACCP 적용업소 — 식약처 안전관리인증 받은 제조사"
            >
              🏅 HACCP
            </span>
          )}
        </h1>
        <div className="text-stone-600 text-sm mt-1">
          {product.brand} · {product.unit}
        </div>

        {/* 제조/원산지/등급/인증 정보 */}
        {(product.manufacturer ||
          product.origin ||
          product.grade ||
          (product.certifications && product.certifications.length > 0)) && (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {product.manufacturer && (
              <div className="bg-stone-50 rounded px-2 py-1.5">
                <div className="text-[10px] text-stone-500">제조</div>
                <div className="font-medium text-stone-700 truncate">
                  {product.manufacturer}
                </div>
              </div>
            )}
            {product.origin && (
              <div className="bg-stone-50 rounded px-2 py-1.5">
                <div className="text-[10px] text-stone-500">원산지</div>
                <div className="font-medium text-stone-700 truncate">
                  {product.origin}
                </div>
              </div>
            )}
            {product.grade && (
              <div className="bg-amber-50 rounded px-2 py-1.5">
                <div className="text-[10px] text-amber-700">등급</div>
                <div className="font-medium text-amber-800 truncate">
                  {product.grade}
                </div>
              </div>
            )}
            {product.certifications && product.certifications.length > 0 && (
              <div className="bg-emerald-50 rounded px-2 py-1.5">
                <div className="text-[10px] text-emerald-700">인증</div>
                <div className="font-medium text-emerald-800 truncate">
                  {product.certifications.join(", ")}
                </div>
              </div>
            )}
          </div>
        )}
        {product.description && (
          <div className="mt-2 text-xs text-stone-500">
            {product.description}
          </div>
        )}

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
        <div className="mt-4">
          <PriceAlertButton
            productId={product.id}
            productName={product.name}
            currentMinPrice={minPrice}
          />
        </div>
      </header>

      <section>
        <h2 className="font-bold mb-3 flex items-center gap-2">
          📈 가격 추이
          <span className="text-xs text-stone-500 font-normal">
            (최근 60일, 매장별)
          </span>
        </h2>
        <PriceHistoryChart history={history} />
      </section>

      {/* 원재료 정보 — 농수산물(KAMIS)은 C002에 데이터 없음 → 스킵 */}
      {product.category !== "농수산물" && (
        <IngredientsPanel productId={product.id} />
      )}

      {/* 영양 정보 — 식품영양성분DB는 가공식품/농수산물 모두 보유 → 모든 카테고리 표시 */}
      <NutritionPanel productId={product.id} />

      {/* 오프라인/온라인 모두 0건 — 통합 빈 상태 */}
      {offlineRows.length === 0 && onlineRows.length === 0 ? (
        <EmptyState
          icon="🏷️"
          title="이 상품은 아직 매장에 등록되지 않았습니다"
          description={
            <>
              영수증을 올리거나 직접 입력해서 첫 가격을 등록해보세요.
              <br />
              온라인 쇼핑몰 가격은 네이버 쇼핑 동기화로 한 번에 가져올 수 있어요.
            </>
          }
          actions={[
            { href: "/upload", label: "📸 영수증 올리기", primary: true },
            { href: "/sync", label: "🔄 네이버 쇼핑 동기화" },
          ]}
        />
      ) : (
        <>
          <section>
            <h2 className="font-bold mb-3 flex items-center gap-2">
              🛒 오프라인 매장
              <span className="text-xs text-stone-500 font-normal">
                ({offlineRows.length}개 매장, 낮은 순)
              </span>
            </h2>
            <PriceListClient
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
            <PriceListClient
              showFavoriteFilter={false}
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
        </>
      )}
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
