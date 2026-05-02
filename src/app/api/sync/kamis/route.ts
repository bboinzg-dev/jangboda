import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchKamisPrices } from "@/lib/kamis";

// POST /api/sync/kamis — KAMIS 농수산물 가격을 가져와 가상 매장 "공공시세(KAMIS)"에 저장
// 이 매장은 실제 매장이 아니라 "오늘의 평균 시세" 기준점입니다.
export async function POST() {
  const { prices, usedMock, date, error } = await fetchKamisPrices();

  // 1. KAMIS 가상 체인/매장 보장
  const chain = await prisma.chain.upsert({
    where: { name: "공공시세(KAMIS)" },
    update: {},
    create: { name: "공공시세(KAMIS)" },
  });

  let store = await prisma.store.findFirst({
    where: { chainId: chain.id, name: "전국 평균 소매시세" },
  });
  if (!store) {
    store = await prisma.store.create({
      data: {
        chainId: chain.id,
        name: "전국 평균 소매시세",
        address: "한국 농수산물유통공사 (KAMIS) 전국 표본",
        lat: 0,
        lng: 0,
        hours: "매일 갱신",
      },
    });
  }

  // 2. KAMIS 품목을 우리 Product로 매칭하거나 신규 생성
  let inserted = 0;
  for (const k of prices) {
    const productName = k.productName;
    let product = await prisma.product.findFirst({
      where: {
        OR: [
          { name: productName },
          { aliases: { some: { alias: productName } } },
        ],
      },
    });
    if (!product) {
      product = await prisma.product.create({
        data: {
          name: productName,
          category: "농수산물",
          unit: k.unit,
          brand: "농수산물 (시세)",
          aliases: { create: [{ alias: productName }] },
        },
      });
    }

    await prisma.price.create({
      data: {
        productId: product.id,
        storeId: store.id,
        price: k.retailPrice,
        source: "kamis",
      },
    });
    inserted++;
  }

  return NextResponse.json({ ok: true, inserted, usedMock, date, error });
}
