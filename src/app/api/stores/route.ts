import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { distanceKm } from "@/lib/geo";

// GET /api/stores?lat=37.5&lng=127.1&radius=5
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat") ?? "");
  const lng = parseFloat(searchParams.get("lng") ?? "");
  const radius = parseFloat(searchParams.get("radius") ?? "10");

  const stores = await prisma.store.findMany({
    include: { chain: true },
  });

  // priceCount = unique productId 수 (같은 product 여러 가격은 1건으로)
  // (매장 상세 페이지의 표시와 일관)
  const distinctPairs = await prisma.price.findMany({
    distinct: ["storeId", "productId"],
    select: { storeId: true },
  });
  const storeUniqueProducts = new Map<string, number>();
  for (const p of distinctPairs) {
    storeUniqueProducts.set(p.storeId, (storeUniqueProducts.get(p.storeId) ?? 0) + 1);
  }

  // chainId별 unique product 합계 — store가 0건일 때 chain fallback 표시
  const chainTotals = new Map<string, number>();
  for (const s of stores) {
    const c = storeUniqueProducts.get(s.id) ?? 0;
    chainTotals.set(s.chainId, (chainTotals.get(s.chainId) ?? 0) + c);
  }

  let result = stores.map((s) => ({
    id: s.id,
    name: s.name,
    chainId: s.chainId,
    chainName: s.chain.name,
    chainCategory: s.chain.category,
    chainLogoUrl: s.chain.logoUrl,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    hours: s.hours,
    priceCount: storeUniqueProducts.get(s.id) ?? 0,
    chainPriceCount: chainTotals.get(s.chainId) ?? 0,
    distanceKm: !isNaN(lat) && !isNaN(lng) ? distanceKm(lat, lng, s.lat, s.lng) : null,
  }));

  if (!isNaN(lat) && !isNaN(lng)) {
    result = result
      .filter((s) => (s.distanceKm ?? Infinity) <= radius)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }

  return NextResponse.json(
    { stores: result },
    {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
      },
    }
  );
}
