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

  let result = stores.map((s) => ({
    id: s.id,
    name: s.name,
    chainName: s.chain.name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    hours: s.hours,
    priceCount: s._count.prices,
    distanceKm: !isNaN(lat) && !isNaN(lng) ? distanceKm(lat, lng, s.lat, s.lng) : null,
  }));

  if (!isNaN(lat) && !isNaN(lng)) {
    result = result
      .filter((s) => (s.distanceKm ?? Infinity) <= radius)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }

  return NextResponse.json({ stores: result });
}
