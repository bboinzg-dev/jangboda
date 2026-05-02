import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatWon } from "@/lib/format";

export const dynamic = "force-dynamic";

async function getHomeData() {
  const totalProducts = await prisma.product.count();
  const totalStores = await prisma.store.count();
  const totalPrices = await prisma.price.count();
  const totalReceipts = await prisma.receipt.count();

  // 인기 카테고리별 대표 상품
  const products = await prisma.product.findMany({
    take: 8,
    include: { prices: true },
  });

  const cards = products
    .map((p) => {
      if (p.prices.length === 0) return null;
      const prices = p.prices.map((x) => x.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        unit: p.unit,
        min,
        max,
        diff: max - min,
        count: prices.length,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.diff - a.diff);

  return { totalProducts, totalStores, totalPrices, totalReceipts, cards };
}

export default async function HomePage() {
  const data = await getHomeData();

  return (
    <div className="space-y-8">
      <section className="bg-gradient-to-br from-brand-50 to-orange-50 rounded-xl p-8 border border-brand-100">
        <h1 className="text-3xl font-bold text-stone-900 mb-2">
          우리 동네 마트, 어디가 제일 쌀까?
        </h1>
        <p className="text-stone-600 mb-6 leading-relaxed">
          롯데마트, 킴스클럽, 이마트, 홈플러스의 실제 가격을 비교하세요.
          <br />
          영수증 한 장만 올려도 동네 이웃 모두가 절약합니다.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/search"
            className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg font-medium"
          >
            상품 검색하기
          </Link>
          <Link
            href="/upload"
            className="bg-white hover:bg-stone-50 border border-stone-200 px-5 py-2.5 rounded-lg font-medium"
          >
            영수증 올리고 포인트 받기
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="등록 상품" value={data.totalProducts.toLocaleString()} />
        <StatCard label="제휴 매장" value={data.totalStores.toLocaleString()} />
        <StatCard label="가격 데이터" value={data.totalPrices.toLocaleString()} />
        <StatCard label="누적 영수증" value={data.totalReceipts.toLocaleString()} />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">🔥 마트별 가격차 큰 상품</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.cards.map((c) => (
            <Link
              key={c.id}
              href={`/products/${c.id}`}
              className="card-clickable relative bg-white border border-stone-200 rounded-lg p-4 pr-8 flex justify-between items-center"
            >
              <div className="min-w-0">
                <div className="text-xs text-stone-500">{c.category}</div>
                <div className="font-semibold truncate">{c.name}</div>
                <div className="text-xs text-stone-500">{c.unit}</div>
              </div>
              <div className="text-right shrink-0 ml-4">
                <div className="text-xs text-stone-500">최저가</div>
                <div className="font-bold text-brand-600">{formatWon(c.min)}</div>
                <div className="text-xs text-rose-600">
                  최대 {formatWon(c.diff)} 차이
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-2xl font-bold text-stone-900">{value}</div>
    </div>
  );
}
