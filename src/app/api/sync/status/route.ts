// 마지막 동기화 시각 — UI에서 "자동 갱신 중" 안내용
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const revalidate = 60; // 1분 캐시

export async function GET() {
  const [kamisLatest, naverLatest, productCount, storeCount, priceCount] =
    await Promise.all([
      prisma.price.findFirst({
        where: { source: "kamis" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.price.findFirst({
        where: { source: "naver" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.product.count(),
      prisma.store.count(),
      prisma.price.count(),
    ]);

  return NextResponse.json({
    kamis: { lastSyncedAt: kamisLatest?.createdAt ?? null },
    naver: { lastSyncedAt: naverLatest?.createdAt ?? null },
    counts: {
      products: productCount,
      stores: storeCount,
      prices: priceCount,
    },
  });
}
