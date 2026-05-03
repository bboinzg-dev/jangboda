import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 1) 같은 chain의 매장별 가격 차이 확인 — "참가격이 같은 유통사면 같냐?" 질문 답
console.log("=== 1. 같은 chain 매장별 가격 차이 (이마트, 롯데슈퍼 샘플) ===");
for (const chainName of ["이마트", "롯데슈퍼", "GS25", "CU"]) {
  const chain = await prisma.chain.findUnique({ where: { name: chainName } });
  if (!chain) continue;
  const stores = await prisma.store.findMany({ where: { chainId: chain.id }, select: { id: true, name: true } });
  if (stores.length < 2) continue;

  // 첫 매장의 product 1~2개 잡고 다른 매장 가격과 비교
  const firstStore = stores[0];
  const samplePrice = await prisma.price.findFirst({
    where: { storeId: firstStore.id, source: "parsa" },
    include: { product: { select: { id: true, name: true } } },
  });
  if (!samplePrice) continue;

  const allPrices = await prisma.price.findMany({
    where: { productId: samplePrice.productId, source: "parsa", storeId: { in: stores.map(s => s.id) } },
    select: { price: true, store: { select: { name: true } } },
    orderBy: { price: "asc" },
    take: 5,
  });
  console.log(`\n[${chainName}] ${samplePrice.product.name} — ${stores.length}개 매장 중 ${allPrices.length}건:`);
  allPrices.forEach(p => console.log(`  ${p.store.name}: ${p.price}원`));
}

// 2) 시드 12개 → ParsaProduct 매칭 후보 찾기
console.log("\n\n=== 2. 시드 12개 → ParsaProduct 매칭 후보 ===");
const SEED_KEYWORDS = [
  ["농심 신라면 멀티팩", "신라면"],
  ["오뚜기 진라면 매운맛", "진라면"],
  ["서울우유 흰우유", "서울우유"],
  ["매일우유 저지방", "매일우유"],
  ["CJ 햇반 백미밥", "햇반"],
  ["동원 참치 살코기", "동원 참치"],
  ["코카콜라 1.5L", "코카콜라"],
  ["삼다수 생수", "삼다수"],
  ["한우 등심 1등급", "한우 등심"],
  ["친환경 계란 대란", "계란"],
  ["스팸 클래식", "스팸"],
  ["풀무원 두부 찌개용", "두부"],
];

for (const [seedName, keyword] of SEED_KEYWORDS) {
  const candidates = await prisma.product.findMany({
    where: {
      externalId: { startsWith: "parsa:product:" },
      name: { contains: keyword },
    },
    select: { id: true, name: true, _count: { select: { prices: true } } },
    orderBy: { name: "asc" },
    take: 5,
  });
  console.log(`\n[시드] ${seedName} (키워드: ${keyword})`);
  if (candidates.length === 0) {
    console.log(`  ❌ ParsaProduct에 매칭 없음`);
  } else {
    candidates.forEach(p => console.log(`  → ${p.name} (${p._count.prices}건)`));
  }
}

await prisma.$disconnect();
