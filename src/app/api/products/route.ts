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

  // 각 상품의 최저가/평균가 + 등록 chain 분포 — 한 번에 join으로 가져옴
  // chain 분포는 사용자가 "이 상품은 어디 있나" 보고 다른 product 카드와 비교해
  // 같은 SKU인지 판단하는 데 도움 (이름이 살짝 달라도 매장 분포로 동일성 추정)
  const productIds = products.map((p) => p.id);
  const allPrices = await prisma.price.findMany({
    where: {
      productId: { in: productIds },
      source: { not: "stats_official" }, // 시세는 매장 가격 통계에서 제외
    },
    select: {
      productId: true,
      listPrice: true,
      store: { select: { chain: { select: { name: true, logoUrl: true } } } },
    },
  });

  type Stat = { min: number; max: number; avg: number; count: number };
  type ChainEntry = { name: string; logoUrl: string | null; count: number };
  const stats = new Map<string, Stat>();
  const chainsByProduct = new Map<string, Map<string, ChainEntry>>();

  for (const id of productIds) {
    const rows = allPrices.filter((p) => p.productId === id);
    const list = rows.map((p) => p.listPrice ?? 0).filter((x) => x > 0);
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
    const chMap = new Map<string, ChainEntry>();
    for (const r of rows) {
      const ch = r.store?.chain;
      if (!ch?.name) continue;
      const cur = chMap.get(ch.name);
      if (cur) cur.count++;
      else chMap.set(ch.name, { name: ch.name, logoUrl: ch.logoUrl, count: 1 });
    }
    chainsByProduct.set(id, chMap);
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
        // chain 등록 빈도 높은 순으로 정렬, 카드 UI 공간 고려해 top 6만
        chains: Array.from(chainsByProduct.get(p.id)?.values() ?? [])
          .sort((a, b) => b.count - a.count)
          .slice(0, 6),
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
