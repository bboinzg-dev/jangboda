import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 1. 강동구 근처 매장 4개 priceCount 확인
const stores = await prisma.store.findMany({
  where: {
    OR: [
      { name: { contains: "롯데마트 천호" } },
      { name: { contains: "GS25 힐데스" } },
      { name: { contains: "강동농협" } },
      { name: { contains: "이마트24 강동부흥" } },
    ],
  },
  select: {
    id: true,
    name: true,
    chain: { select: { name: true } },
    _count: { select: { prices: true } },
  },
});
console.log("=== 강동구 매장 priceCount ===");
stores.forEach((s) => console.log(`  ${s.chain.name} | ${s.name}: ${s._count.prices}건`));

// 2. ParsaPrice가 어떤 store에 매핑됐는지 확인
console.log("\n=== ParsaPrice 매핑된 Store top 10 ===");
const sample = await prisma.price.groupBy({
  by: ["storeId"],
  where: { source: "parsa" },
  _count: true,
  orderBy: { _count: { storeId: "desc" } },
  take: 10,
});
for (const s of sample) {
  const store = await prisma.store.findUnique({
    where: { id: s.storeId },
    select: { name: true, chain: { select: { name: true } } },
  });
  console.log(`  ${store?.chain.name} | ${store?.name}: ${s._count}건`);
}

// 3. 롯데마트 chain의 매장들 priceCount
console.log("\n=== 롯데마트 chain 매장별 priceCount ===");
const lotte = await prisma.store.findMany({
  where: { chain: { name: "롯데마트" } },
  select: { name: true, _count: { select: { prices: true } } },
});
lotte.forEach((s) => console.log(`  ${s.name}: ${s._count.prices}건`));

// 4. GS25 chain 매장 수
console.log("\n=== GS25 chain 매장 수 ===");
const gs25Count = await prisma.store.count({ where: { chain: { name: "GS25" } } });
const gs25WithPrice = await prisma.store.count({
  where: { chain: { name: "GS25" }, prices: { some: {} } },
});
console.log(`GS25: 총 ${gs25Count}개 매장 / 가격있는 매장 ${gs25WithPrice}개`);

// 5. 잘못된 image 채워진 농수산/원물 product 추정
console.log("\n=== 농수산/원물 카테고리지만 imageUrl 있는 product (잘못 매칭 의심) ===");
const susImages = await prisma.product.findMany({
  where: {
    imageUrl: { not: null },
    OR: [
      { name: { contains: "당근" } },
      { name: { contains: "양파" } },
      { name: { contains: "감자" } },
      { name: { contains: "고구마" } },
      { name: { contains: "마늘" } },
      { name: { contains: "쌀" } },
      { name: { contains: "사과" } },
      { name: { contains: "배추" } },
    ],
  },
  select: { name: true, category: true, imageUrl: true },
  take: 20,
});
susImages.forEach((p) => console.log(`  [${p.category}] ${p.name}: ${p.imageUrl?.slice(0, 70)}`));

await prisma.$disconnect();
