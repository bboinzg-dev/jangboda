// 마지막 동기화 시각 — UI에서 "자동 갱신 중" 안내용
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 휴면 상태에서는 DB가 중지될 수 있으므로 빌드 시 이 엔드포인트를 정적 생성하지 않는다.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
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
      database: { available: true },
      kamis: { lastSyncedAt: kamisLatest?.createdAt ?? null },
      naver: { lastSyncedAt: naverLatest?.createdAt ?? null },
      counts: {
        products: productCount,
        stores: storeCount,
        prices: priceCount,
      },
    });
  } catch {
    // 휴면 운영으로 DB를 중지한 경우에도 UI가 상태 응답을 안전하게 처리하게 한다.
    return NextResponse.json({
      database: { available: false, state: "dormant" },
      kamis: { lastSyncedAt: null },
      naver: { lastSyncedAt: null },
      counts: { products: 0, stores: 0, prices: 0 },
    });
  }
}
