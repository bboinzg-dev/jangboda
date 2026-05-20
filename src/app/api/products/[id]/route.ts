import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/products/[id] — 상품 상세 + 매장별 최신 가격
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: { aliases: true },
  });
  if (!product) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다" }, { status: 404 });
  }

  // 매장별 최신 가격 — distinct + orderBy로 N+1 회피
  // Prisma는 PostgreSQL DISTINCT ON 지원: (storeId, createdAt DESC)로
  // 매장당 최신 row 1건만 select. 매장 수가 100개여도 쿼리 1회.
  const latestPrices = await prisma.price.findMany({
    where: { productId: product.id },
    distinct: ["storeId"],
    orderBy: [{ storeId: "asc" }, { createdAt: "desc" }],
    include: { store: { include: { chain: true } } },
  });

  const filtered = latestPrices
    .map((p) => ({
      storeId: p.store.id,
      storeName: p.store.name,
      chainName: p.store.chain.name,
      address: p.store.address,
      lat: p.store.lat,
      lng: p.store.lng,
      price: p.listPrice ?? 0,
      listPrice: p.listPrice ?? 0,
      paidPrice: p.paidPrice,
      promotionType: p.promotionType,
      source: p.source,
      updatedAt: p.createdAt,
    }))
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
      price: h.listPrice ?? 0,
      chainName: h.store.chain.name,
      storeName: h.store.name,
    })),
  });
}
