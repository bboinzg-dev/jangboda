import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/products/[id] — 상품 상세 + 매장별 최신 가격
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    include: { aliases: true },
  });
  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  // 매장별로 가장 최근 가격 1건씩 추출
  const stores = await prisma.store.findMany({ include: { chain: true } });
  const latestByStore = await Promise.all(
    stores.map(async (s) => {
      const latest = await prisma.price.findFirst({
        where: { productId: product.id, storeId: s.id },
        orderBy: { createdAt: "desc" },
      });
      return latest
        ? {
            storeId: s.id,
            storeName: s.name,
            chainName: s.chain.name,
            address: s.address,
            lat: s.lat,
            lng: s.lng,
            price: latest.price,
            isOnSale: latest.isOnSale,
            source: latest.source,
            updatedAt: latest.createdAt,
          }
        : null;
    })
  );

  const filtered = latestByStore
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.price - b.price);

  // 가격 추이 (최근 30일)
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const history = await prisma.price.findMany({
    where: { productId: product.id, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    include: { store: { include: { chain: true } } },
  });

  return NextResponse.json({
    product: {
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      unit: product.unit,
      aliases: product.aliases.map((a) => a.alias),
    },
    prices: filtered,
    history: history.map((h) => ({
      date: h.createdAt,
      price: h.price,
      chainName: h.store.chain.name,
      storeName: h.store.name,
    })),
  });
}
