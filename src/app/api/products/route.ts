import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/products?q=신라면&category=라면
//
// Query params:
//   q          - 이름/브랜드/alias contains 검색
//   category   - 카테고리 정확 일치
//   sort       - "popular" → priceCount desc
//   limit      - 결과 수 (default 200, max 1000)
//   slim=true  - logoUrl/count 제외 lite chain (이름만) 반환 — /cart처럼 카드에 작은 chain 칩만 쓰는 곳용
//                stats(min/max/avg)는 그대로 계산
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? undefined;
  const sort = searchParams.get("sort") ?? undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "200"), 1000);
  const slim = searchParams.get("slim") === "true";

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
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      unit: true,
      hasHaccp: true,
      imageUrl: true,
      // alias는 항상 — 클라이언트 측 검색 매칭에 가벼움 (avg 1.1개)
      aliases: { select: { alias: true } },
      _count: { select: { prices: true } },
    },
    orderBy: sort === "popular" ? { prices: { _count: "desc" } } : undefined,
    take: limit,
  });

  // 가격 + chain 분포 — slim이면 chain 이름만(logoUrl 미포함, 페이로드 ↓)
  const productIds = products.map((p) => p.id);
  const allPrices = await prisma.price.findMany({
    where: {
      productId: { in: productIds },
      source: { not: "stats_official" },
    },
    select: {
      productId: true,
      listPrice: true,
      store: {
        select: {
          chain: slim
            ? { select: { name: true } }
            : { select: { name: true, logoUrl: true } },
        },
      },
    },
  });

  type Stat = { min: number; max: number; avg: number; count: number };
  type ChainEntry = { name: string; logoUrl: string | null; count: number };
  const stats = new Map<string, Stat>();
  const chainsByProduct = new Map<string, Map<string, ChainEntry>>();

  // productId → row 묶기 (filter N²을 단일 패스로)
  const rowsByProduct = new Map<string, typeof allPrices>();
  for (const r of allPrices) {
    const arr = rowsByProduct.get(r.productId);
    if (arr) arr.push(r);
    else rowsByProduct.set(r.productId, [r]);
  }

  for (const id of productIds) {
    const rows = rowsByProduct.get(id) ?? [];
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
      const ch = r.store?.chain as
        | { name: string; logoUrl?: string | null }
        | undefined;
      if (!ch?.name) continue;
      const cur = chMap.get(ch.name);
      if (cur) cur.count++;
      else chMap.set(ch.name, { name: ch.name, logoUrl: ch.logoUrl ?? null, count: 1 });
    }
    chainsByProduct.set(id, chMap);
  }

  return NextResponse.json(
    {
      products: products.map((p) => {
        const chArr = Array.from(chainsByProduct.get(p.id)?.values() ?? [])
          .sort((a, b) => b.count - a.count)
          .slice(0, 6);
        return {
          id: p.id,
          name: p.name,
          brand: p.brand,
          category: p.category,
          unit: p.unit,
          priceCount: p._count.prices,
          stats: stats.get(p.id),
          // slim: 이름 배열 (가벼움). full: { name, logoUrl, count }[] (카드 풍부 표시용)
          chains: slim
            ? chArr.map((c) => c.name)
            : chArr,
          aliases: p.aliases.map((a) => a.alias),
          hasHaccp: p.hasHaccp,
          imageUrl: p.imageUrl,
        };
      }),
    },
    {
      headers: {
        // 카탈로그는 자주 안 바뀜 → 5분 캐시 + 30분 SWR (재방문 즉시 응답)
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
      },
    }
  );
}
