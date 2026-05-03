import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 1) 임금님표 이천쌀 가격 데이터 확인
console.log("=== 1. 임금님표 이천쌀 ===");
const p = await prisma.product.findFirst({
  where: { name: { contains: "임금님표" } },
  select: { id: true, name: true, externalId: true, _count: { select: { prices: true } } },
});
console.log("Product:", p);

if (p) {
  const goodId = p.externalId?.replace("parsa:product:", "");
  if (goodId) {
    const parsaPriceCount = await prisma.parsaPrice.count({ where: { goodId } });
    console.log(`ParsaPrice rows for goodId=${goodId}:`, parsaPriceCount);

    // Price 테이블에 source="parsa" 가격이 있는가?
    const pricesInMain = await prisma.price.count({
      where: { productId: p.id, source: "parsa" },
    });
    console.log(`Price (source=parsa) rows for productId:`, pricesInMain);

    // ParsaPrice의 entpId 5개 sample → Store에 매핑됐나?
    const samples = await prisma.parsaPrice.findMany({
      where: { goodId },
      take: 5,
      select: { entpId: true, price: true },
    });
    console.log("ParsaPrice 샘플:");
    for (const s of samples) {
      const store = await prisma.store.findFirst({
        where: { externalId: `parsa:${s.entpId}` },
        select: { id: true, name: true },
      });
      console.log(`  entpId=${s.entpId} ${s.price}원 → Store: ${store?.name ?? "(매핑 안 됨)"}`);
    }
  }
}

// 2) imageUrl 채워진 product 수
console.log("\n=== 2. 이미지/로고 상태 ===");
const totalProd = await prisma.product.count();
const withImage = await prisma.product.count({ where: { imageUrl: { not: null } } });
console.log(`Product imageUrl 채워짐: ${withImage}/${totalProd}`);

const totalChain = await prisma.chain.count();
const withLogo = await prisma.chain.count({ where: { logoUrl: { not: null } } });
console.log(`Chain logoUrl 채워짐: ${withLogo}/${totalChain}`);

// chain이름 + logoUrl
const chains = await prisma.chain.findMany({
  select: { name: true, logoUrl: true },
  orderBy: { name: "asc" },
});
console.log("\n전체 Chain logoUrl:");
chains.forEach((c) => console.log(`  ${c.name}: ${c.logoUrl ?? "(null)"}`));

await prisma.$disconnect();
