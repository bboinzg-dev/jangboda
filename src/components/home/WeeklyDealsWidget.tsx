// 이번 주 우리 동네 특가 위젯 — 반복 방문 후크
// 최근 7일 내 등록된 행사가(paidPrice < listPrice) 중 절약률 큰 순으로 상품 distinct TOP 8
//
// 서버 컴포넌트 — 페이지 ISR(60초)을 그대로 따라가서 매 요청 DB 호출 안 함
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatWon } from "@/lib/format";
import ProductImage from "@/components/ProductImage";

export default async function WeeklyDealsWidget() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 최근 7일 + 행사가 (paidPrice 있고 listPrice보다 낮음) 가격 중 절약 큰 순
  // take를 후하게 잡고 메모리에서 product distinct + 절약률 정렬
  const recentDeals = await prisma.price.findMany({
    where: {
      createdAt: { gte: sevenDaysAgo },
      paidPrice: { not: null },
      // listPrice는 항상 채워짐
    },
    take: 200,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      listPrice: true,
      paidPrice: true,
      promotionType: true,
      productId: true,
      product: {
        select: { id: true, name: true, brand: true, unit: true, imageUrl: true },
      },
      store: {
        select: { name: true, chain: { select: { name: true } } },
      },
    },
  });

  // product 중복 제거 — 같은 상품은 가장 절약률 큰 가격만
  const bestByProduct = new Map<
    string,
    {
      priceId: string;
      productId: string;
      productName: string;
      brand: string | null;
      unit: string;
      imageUrl: string | null;
      list: number;
      paid: number;
      promotionType: string | null;
      storeName: string;
      chainName: string;
      savingsPct: number;
    }
  >();
  for (const p of recentDeals) {
    if (!p.product || p.paidPrice == null || p.paidPrice >= p.listPrice) continue;
    const savingsPct = Math.round(((p.listPrice - p.paidPrice) / p.listPrice) * 100);
    if (savingsPct < 5) continue; // 5% 미만은 노이즈
    const prev = bestByProduct.get(p.productId);
    if (!prev || prev.savingsPct < savingsPct) {
      bestByProduct.set(p.productId, {
        priceId: p.id,
        productId: p.productId,
        productName: p.product.name,
        brand: p.product.brand,
        unit: p.product.unit,
        imageUrl: p.product.imageUrl,
        list: p.listPrice,
        paid: p.paidPrice,
        promotionType: p.promotionType,
        storeName: p.store?.name ?? "",
        chainName: p.store?.chain?.name ?? "",
        savingsPct,
      });
    }
  }

  const deals = Array.from(bestByProduct.values())
    .sort((a, b) => b.savingsPct - a.savingsPct)
    .slice(0, 8);

  if (deals.length === 0) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="section-title flex items-center gap-2">
          <span aria-hidden>🔥</span> 이번 주 특가
          <span className="hidden md:inline text-xs text-ink-3 font-normal">
            최근 7일
          </span>
        </h2>
        <Link
          href="/cart"
          className="text-xs text-brand-600 hover:underline font-medium"
        >
          담아보기 →
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {deals.map((d) => (
          <Link
            key={d.priceId}
            href={`/products/${d.productId}`}
            className="card-clickable card p-3 flex flex-col gap-1.5"
          >
            <div className="flex items-start gap-2">
              <ProductImage src={d.imageUrl} alt={d.productName} size={44} />
              <div className="min-w-0 flex-1">
                {/* 상품명은 line-clamp-2 + 최소 높이 고정 — grid에서 카드 높이 들쑥날쑥 방지 */}
                <div className="font-semibold text-sm text-ink-1 line-clamp-2 leading-tight min-h-[2.4em]">
                  {d.productName}
                </div>
                {d.chainName && (
                  <div className="text-[10px] text-ink-3 truncate mt-0.5">
                    {d.chainName}
                  </div>
                )}
              </div>
            </div>
            {/* 원가(작은 글씨) ↔ 할인가(큰 글씨) — baseline은 작은 글씨가 위로 떠 보임 → items-center */}
            <div className="flex items-center justify-between gap-1 mt-auto pt-1">
              <div className="text-[10px] text-ink-3 line-through tabular-nums">
                {formatWon(d.list)}
              </div>
              <div className="text-sm font-bold tabular-nums text-danger-text">
                {formatWon(d.paid)}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <span className="bg-danger-soft text-danger-text text-[10px] font-bold px-1.5 py-0.5 rounded">
                -{d.savingsPct}%
              </span>
              {d.promotionType && (
                <span className="text-[10px] text-ink-3">{d.promotionType}</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
