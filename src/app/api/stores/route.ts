import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveStoreHours } from "@/lib/chainHours";

// GET /api/stores
// 사용자 위치는 받지 않음 — 모두에게 동일한 응답이라 CDN 캐시 적중률 100%.
// 거리 계산·정렬·반경 필터는 클라이언트(haversineKm) 측에서 처리.
export async function GET() {
  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      chainId: true,
      address: true,
      lat: true,
      lng: true,
      hours: true,
      chain: { select: { name: true, category: true, logoUrl: true } },
    },
  });

  // priceCount = unique productId 수 (같은 product 여러 가격은 1건)
  // distinct 쿼리 한 번 — DB가 SQL 측 DISTINCT로 처리 (메모리 dedup보다 효율적)
  const distinctPairs = await prisma.price.findMany({
    distinct: ["storeId", "productId"],
    select: { storeId: true },
  });
  const storeUniqueProducts = new Map<string, number>();
  for (const p of distinctPairs) {
    storeUniqueProducts.set(p.storeId, (storeUniqueProducts.get(p.storeId) ?? 0) + 1);
  }

  // chainId별 unique product 합계 — 매장 0건일 때 chain fallback 표시용
  const chainTotals = new Map<string, number>();
  for (const s of stores) {
    const c = storeUniqueProducts.get(s.id) ?? 0;
    chainTotals.set(s.chainId, (chainTotals.get(s.chainId) ?? 0) + c);
  }

  const result = stores.map((s) => {
    // store.hours가 null이면 체인 default로 보강 (이마트 10:00~23:00 등)
    // hoursSource: "store"=DB raw, "chain"=체인 default, "unknown"=정보 없음
    const resolved = resolveStoreHours(s.hours, s.chain.name);
    return {
      id: s.id,
      name: s.name,
      chainId: s.chainId,
      chainName: s.chain.name,
      chainCategory: s.chain.category,
      chainLogoUrl: s.chain.logoUrl,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      hours: resolved.hours,
      hoursSource: resolved.source, // 카드에서 "체인 평균" 라벨 표시용
      hoursNote: resolved.note,
      priceCount: storeUniqueProducts.get(s.id) ?? 0,
      chainPriceCount: chainTotals.get(s.chainId) ?? 0,
      // distanceKm은 클라이언트에서 계산 (lat/lng 받았으니 즉시)
      distanceKm: null as number | null,
    };
  });

  return NextResponse.json(
    { stores: result },
    {
      headers: {
        // 매장 정보는 거의 안 바뀜 (월 1회 sync) → 10분 CDN + 1시간 SWR
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600",
      },
    }
  );
}
