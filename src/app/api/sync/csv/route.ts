import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { csvToObjects } from "@/lib/csv";
import { matchProduct, matchStore } from "@/lib/matcher";

// POST /api/sync/csv — 보편 CSV 임포트
// 어떤 출처(소비자원 참가격, 마트 전단지, 자체 조사 등)든
// 정해진 컬럼만 맞추면 일괄 등록됩니다.
//
// 필수 컬럼: product, store, price
// 선택 컬럼: source (기본 "csv"), category, brand, unit, isOnSale (true/false)
//
// 매칭 정책:
//   - product: 카탈로그 매칭 시도 → 없으면 신규 Product 생성
//   - store: 매칭 시도 → 없으면 새 Store를 chainName="기타" 아래 생성
//
// body: { csv: string, sourceLabel?: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const csv: string = body.csv ?? "";
  const sourceLabel: string = body.sourceLabel ?? "csv";

  if (!csv.trim()) {
    return NextResponse.json({ error: "csv 본문 비어있음" }, { status: 400 });
  }

  const rows = csvToObjects(csv);
  if (rows.length === 0) {
    return NextResponse.json({ error: "유효한 행 없음" }, { status: 400 });
  }

  let inserted = 0;
  let createdProducts = 0;
  let createdStores = 0;
  const skipped: string[] = [];

  for (const r of rows) {
    const productName = r.product?.trim();
    const storeName = r.store?.trim();
    const priceNum = parseInt((r.price ?? "").replace(/[,원\s]/g, ""), 10);

    if (!productName || !storeName || !priceNum || isNaN(priceNum)) {
      skipped.push(`${productName || "?"} / ${storeName || "?"}`);
      continue;
    }

    // 상품 찾기 또는 생성
    let productId = await matchProduct(productName);
    if (!productId) {
      const created = await prisma.product.create({
        data: {
          name: productName,
          category: r.category?.trim() || "기타",
          unit: r.unit?.trim() || "개",
          brand: r.brand?.trim() || null,
          aliases: { create: [{ alias: productName }] },
        },
      });
      productId = created.id;
      createdProducts++;
    }

    // 매장 찾기 또는 생성
    let storeId = await matchStore(storeName);
    if (!storeId) {
      // chain 이름이 함께 들어왔으면 사용, 아니면 "기타"
      const chainName = r.chain?.trim() || "기타";
      const chain = await prisma.chain.upsert({
        where: { name: chainName },
        update: {},
        create: { name: chainName },
      });
      const newStore = await prisma.store.create({
        data: {
          chainId: chain.id,
          name: storeName,
          address: r.address?.trim() || "(주소 미상)",
          lat: parseFloat(r.lat ?? "0") || 0,
          lng: parseFloat(r.lng ?? "0") || 0,
        },
      });
      storeId = newStore.id;
      createdStores++;
    }

    await prisma.price.create({
      data: {
        productId,
        storeId,
        price: priceNum,
        isOnSale: (r.isOnSale ?? "").toLowerCase() === "true",
        source: sourceLabel,
      },
    });
    inserted++;
  }

  return NextResponse.json({
    ok: true,
    inserted,
    createdProducts,
    createdStores,
    skippedCount: skipped.length,
    skipped: skipped.slice(0, 10),
  });
}
