import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/cart/compare — 장바구니 입력 → 마트별 합계 비교
// body: { items: [{ productId, quantity }] }
//
// 이전: stores × items마다 findFirst → N×M 쿼리 → Supabase pool exhaustion
// 지금: prisma 2번만 (stores + 모든 가격 한 번에) → 메모리에서 매핑
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const items = body.items as { productId: string; quantity: number }[];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "장바구니가 비어있음" },
        { status: 400 }
      );
    }

    const productIds = Array.from(new Set(items.map((i) => i.productId)));

    // 1. 매장 목록 + 2. 카트 상품들의 모든 가격 — 두 쿼리 병렬
    const [stores, allPrices] = await Promise.all([
      prisma.store.findMany({ include: { chain: true } }),
      prisma.price.findMany({
        where: { productId: { in: productIds } },
        orderBy: { createdAt: "desc" },
        include: { product: { select: { name: true } } },
      }),
    ]);

    // (productId, storeId) → 가장 최근 가격 1건
    const latestMap = new Map<
      string,
      (typeof allPrices)[number]
    >();
    for (const p of allPrices) {
      const key = `${p.productId}:${p.storeId}`;
      if (!latestMap.has(key)) latestMap.set(key, p);
    }

    // 매장별 합계 계산
    const result = stores.map((store) => {
      const lines = items.map((it) => {
        const key = `${it.productId}:${store.id}`;
        const latest = latestMap.get(key);
        return {
          productId: it.productId,
          productName: latest?.product.name ?? "(미확인)",
          quantity: it.quantity,
          unitPrice: latest?.price ?? null,
          lineTotal: latest ? latest.price * it.quantity : null,
          available: !!latest,
        };
      });

      const availableCount = lines.filter((l) => l.available).length;
      const total = lines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0);

      return {
        storeId: store.id,
        storeName: store.name,
        chainName: store.chain.name,
        chainCategory: store.chain.category,
        address: store.address,
        lat: store.lat,
        lng: store.lng,
        availableCount,
        totalItems: items.length,
        total,
        complete: availableCount === items.length,
        lines,
      };
    });

    // 1개 이상 보유한 매장만 (가격 0건 매장은 시각적 노이즈)
    const meaningful = result.filter((r) => r.availableCount > 0);

    // 정렬: 모든 품목 있는 매장 먼저, 그다음 합계 낮은 순
    meaningful.sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      return a.total - b.total;
    });

    return NextResponse.json({ comparisons: meaningful });
  } catch (e) {
    console.error("[cart/compare] error:", e);
    return NextResponse.json(
      {
        error: "비교 실패",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
