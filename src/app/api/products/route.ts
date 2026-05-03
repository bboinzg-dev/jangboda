import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/products?q=신라면&category=라면
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? undefined;
  const sort = searchParams.get("sort") ?? undefined; // "popular" | undefined
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "200"), 1000);

  const products = await prisma.product.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { brand: { contains: q } },
              { aliases: { some: { alias: { contains: q } } } },
            ],
          }
        : {}),
    },
    include: {
      prices: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: { select: { prices: true } },
    },
    orderBy: sort === "popular" ? { prices: { _count: "desc" } } : undefined,
    take: limit,
  });

  // 각 상품의 최저가/평균가 계산을 위해 가격 한 번 더 집계
  const productIds = products.map((p) => p.id);
  const allPrices = await prisma.price.findMany({
    where: {
      productId: { in: productIds },
      source: { not: "stats_official" }, // 시세는 매장 가격 통계에서 제외
    },
    select: { productId: true, price: true },
  });

  const stats = new Map<string, { min: number; max: number; avg: number; count: number }>();
  for (const id of productIds) {
    const list = allPrices.filter((p) => p.productId === id).map((p) => p.price);
    if (list.length === 0) {
      stats.set(id, { min: 0, max: 0, avg: 0, count: 0 });
    } else {
      const sum = list.reduce((a, b) => a + b, 0);
      stats.set(id, {
        min: Math.min(...list),
        max: Math.max(...list),
        avg: Math.round(sum / list.length),
        count: list.length,
      });
    }
  }

  return NextResponse.json(
    {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
        unit: p.unit,
        priceCount: p._count.prices,
        stats: stats.get(p.id),
        hasHaccp: p.hasHaccp,
        imageUrl: p.imageUrl,
      })),
    },
    {
      headers: {
        // 60초 CDN 캐시 + 5분 stale-while-revalidate (사용자 즉시 응답, 백그라운드 갱신)
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
