import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/parsa/prices/[goodId]
// 가장 최근 inspectDay에 대한 매장별 가격 목록을 반환.
// ParsaStore와 join해 매장명/주소, ParsaCategory(BU)와 join해 업태명을 포함.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ goodId: string }> }
) {
  const { goodId: goodIdRaw } = await params;
  const goodId = decodeURIComponent(goodIdRaw);

  // 가장 최근 조사일 찾기
  const latest = await prisma.parsaPrice.findFirst({
    where: { goodId },
    orderBy: { inspectDay: "desc" },
    select: { inspectDay: true },
  });

  if (!latest) {
    return NextResponse.json(
      { ok: true, goodId, inspectDay: null, prices: [] },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  }

  const inspectDay = latest.inspectDay;
  const rawPrices = await prisma.parsaPrice.findMany({
    where: { goodId, inspectDay },
    orderBy: { price: "asc" },
    select: {
      entpId: true,
      price: true,
      plusoneYn: true,
      discountYn: true,
      discountStart: true,
      discountEnd: true,
    },
  });

  const entpIds = Array.from(new Set(rawPrices.map((p) => p.entpId)));
  const [stores, buCats] = await Promise.all([
    prisma.parsaStore.findMany({
      where: { entpId: { in: entpIds } },
      select: {
        entpId: true,
        entpName: true,
        entpTypeCode: true,
        addrBasic: true,
        roadAddrBasic: true,
      },
    }),
    prisma.parsaCategory.findMany({ where: { classCode: "BU" } }),
  ]);
  const storeMap = new Map(stores.map((s) => [s.entpId, s]));
  const buCatMap = new Map(buCats.map((c) => [c.code, c.codeName]));

  const prices = rawPrices.map((p) => {
    const store = storeMap.get(p.entpId);
    return {
      entpId: p.entpId,
      entpName: store?.entpName ?? null,
      entpTypeCode: store?.entpTypeCode ?? null,
      entpType: store?.entpTypeCode
        ? buCatMap.get(store.entpTypeCode) ?? store.entpTypeCode
        : null,
      price: p.price,
      plusoneYn: p.plusoneYn,
      discountYn: p.discountYn,
      discountStart: p.discountStart,
      discountEnd: p.discountEnd,
      addr: store?.roadAddrBasic ?? store?.addrBasic ?? null,
    };
  });

  return NextResponse.json(
    { ok: true, goodId, inspectDay, count: prices.length, prices },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
