import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchNaverShop, pickLowestByMall } from "@/lib/naverShop";

// Vercel 함수 timeout — 네이버 API 호출 N회로 시간 소요. 60초까지 허용.
export const maxDuration = 60;

// "120g x 5개" → "5개" 같은 단위 키워드 추출 (검색 정밀도 향상용)
function extractUnitKeyword(unit: string): string {
  if (!unit) return "";
  const matches = unit.match(/(\d+(?:\.\d+)?\s*(?:개입|구|봉|입|병|캔|팩|kg|L|ml|g))/gi);
  if (!matches) return "";
  // 마지막 매칭이 보통 묶음 단위 (5개, 30구 등) — 가장 식별력 높음
  return matches[matches.length - 1].replace(/\s/g, "");
}

// "온라인" 가상 체인 보장 — 모든 온라인 몰들이 이 체인 아래로 들어감
async function ensureOnlineStore(mallName: string) {
  const chain = await prisma.chain.upsert({
    where: { name: mallName },
    update: {},
    create: { name: mallName },
  });

  const storeName = `${mallName} 온라인몰`;
  let store = await prisma.store.findFirst({
    where: { chainId: chain.id, name: storeName },
  });
  if (!store) {
    store = await prisma.store.create({
      data: {
        chainId: chain.id,
        name: storeName,
        address: "온라인 (전국 배송)",
        lat: 0,
        lng: 0,
        hours: "24시간",
      },
    });
  }
  return store;
}

// POST /api/sync/naver — 카탈로그 모든 상품을 네이버에서 검색해 온라인몰별 가격 등록
// 사용 한도 절약을 위해 일부 상품만 처리하려면 ?limit=N
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);

  // 너무 일반적인 키워드(예: "양배추")는 노이즈 많음 → brand 있는 상품 우선
  const products = await prisma.product.findMany({
    where: { category: { not: "농수산물" } }, // KAMIS 가져온 농수산물은 제외 (이름이 너무 generic)
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let inserted = 0;
  let storesCreated = 0;
  let usedMockCount = 0;
  const samples: Array<{ product: string; malls: string[] }> = [];

  for (const product of products) {
    // 검색어: 브랜드 + 상품명 + 묶음 단위 (정확도 ↑)
    // 예: "농심 신라면 멀티팩 5개입" — 단품 1봉지가 섞이지 않게
    const unitKw = extractUnitKeyword(product.unit);
    const query = [
      product.brand,
      product.name.replace(product.brand ?? "", "").trim(),
      unitKw,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const { items, usedMock } = await fetchNaverShop(query);
    if (usedMock) usedMockCount++;

    // 가격 outlier 필터: 기존 카탈로그 가격(seed/receipt/manual)의 평균 ±70%만 허용
    const existing = await prisma.price.findMany({
      where: {
        productId: product.id,
        source: { in: ["seed", "manual", "receipt"] },
      },
      select: { price: true },
    });
    const avg =
      existing.length > 0
        ? existing.reduce((s, p) => s + p.price, 0) / existing.length
        : null;

    const lowestByMall = pickLowestByMall(items).filter((it) => {
      if (avg === null) return true;
      return it.lprice >= avg * 0.3 && it.lprice <= avg * 3;
    });

    const malls: string[] = [];
    for (const item of lowestByMall.slice(0, 5)) {
      const store = await ensureOnlineStore(item.mallName);
      const isNew = store.createdAt.getTime() > Date.now() - 5000;
      if (isNew) storesCreated++;

      await prisma.price.create({
        data: {
          productId: product.id,
          storeId: store.id,
          price: item.lprice,
          source: "naver",
        },
      });
      inserted++;
      malls.push(`${item.mallName}:${item.lprice}`);
    }

    if (malls.length > 0) {
      samples.push({ product: product.name, malls });
    }
  }

  return NextResponse.json({
    ok: true,
    productsProcessed: products.length,
    inserted,
    storesCreated,
    usedMockCount,
    samples: samples.slice(0, 5),
  });
}
