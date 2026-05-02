import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/cart/compare — 장바구니 입력 → 마트별 합계 비교
// body: { items: [{ productId, quantity }] }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const items = body.items as { productId: string; quantity: number }[];
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "장바구니가 비어있음" }, { status: 400 });
  }

  const productIds = items.map((i) => i.productId);
  const stores = await prisma.store.findMany({ include: { chain: true } });

  // 매장별 합계 계산
  const result = await Promise.all(
    stores.map(async (store) => {
      const lines = await Promise.all(
        items.map(async (it) => {
          const latest = await prisma.price.findFirst({
            where: { productId: it.productId, storeId: store.id },
            orderBy: { createdAt: "desc" },
            include: { product: true },
          });
          return {
            productId: it.productId,
            productName: latest?.product.name ?? "(미확인)",
            quantity: it.quantity,
            unitPrice: latest?.price ?? null,
            lineTotal: latest ? latest.price * it.quantity : null,
            available: !!latest,
          };
        })
      );

      const availableCount = lines.filter((l) => l.available).length;
      const total = lines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0);

      return {
        storeId: store.id,
        storeName: store.name,
        chainName: store.chain.name,
        address: store.address,
        availableCount,
        totalItems: items.length,
        total,
        complete: availableCount === items.length,
        lines,
      };
    })
  );

  // 정렬: 모든 품목 있는 매장 먼저, 그다음 합계 낮은 순
  result.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    return a.total - b.total;
  });

  return NextResponse.json({ comparisons: result });
}
