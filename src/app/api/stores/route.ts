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
    include: {
      chain: true,
      _count: { select: { prices: true } },
    },
  });

  // chainId별 prices 합계 — store가 0건이어도 chain 단위로 가격 정보 노출
  // (참가격 데이터는 본사 대표매장에만 매핑되어 일반 매장이 0건인 경우 대처)
  const chainGroups = await prisma.price.groupBy({
    by: ["storeId"],
    _count: true,
  });
  const storeIdToCount = new Map(chainGroups.map((g) => [g.storeId, g._count]));
  const chainTotals = new Map<string, number>();
  for (const s of stores) {
    const c = storeIdToCount.get(s.id) ?? 0;
    chainTotals.set(s.chainId, (chainTotals.get(s.chainId) ?? 0) + c);
  }

  let result = stores.map((s) => ({
    id: s.id,
    name: s.name,
    chainId: s.chainId,
    chainName: s.chain.name,
    chainCategory: s.chain.category,
    chainLogoUrl: s.chain.logoUrl, // 매장 카드 등에 chain 로고 표시
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    hours: s.hours,
    priceCount: s._count.prices,
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
