import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 부세 product 확인
const buse = await prisma.product.findMany({
  where: { name: { contains: "부세" } },
  include: { _count: { select: { prices: true } } },
});
console.log("=== 부세 product ===");
for (const p of buse) {
  console.log(`  ${p.id} | ${p.name} | externalId: ${p.externalId} | prices: ${p._count.prices}건`);
}

// ParsaPrice에 부세 데이터 있나?
if (buse.length > 0) {
  for (const p of buse) {
    const goodId = p.externalId?.replace("parsa:product:", "");
    if (goodId) {
      const parsaCount = await prisma.parsaPrice.count({ where: { goodId } });
      console.log(`\n  [${p.name}] ParsaPrice goodId=${goodId}: ${parsaCount}건`);
      if (parsaCount > 0) {
        const samples = await prisma.parsaPrice.findMany({ where: { goodId }, take: 3 });
        for (const s of samples) {
          const store = await prisma.store.findFirst({
            where: { externalId: `parsa:${s.entpId}` },
            select: { name: true, chain: { select: { name: true } } },
          });
          console.log(`    entpId=${s.entpId} ${s.price}원 → Store: ${store?.chain?.name ?? "(매핑안됨)"} | ${store?.name ?? "?"}`);
        }
      }
    }
  }
}

// 참가격 등록 상품 중 prices=0인 것들 sample
console.log("\n=== '참가격 등록 상품' 중 prices=0건 ===");
const noPrice = await prisma.product.findMany({
  where: {
    category: "참가격 등록 상품",
    prices: { none: {} },
  },
  take: 10,
  select: { id: true, name: true, externalId: true },
});
console.log(`총 ${noPrice.length}건 (sample):`);
for (const p of noPrice) {
  console.log(`  ${p.name} (externalId: ${p.externalId})`);
}

// 전체 stat
const totalParsa = await prisma.product.count({
  where: { externalId: { startsWith: "parsa:product:" } },
});
const noPriceParsa = await prisma.product.count({
  where: {
    externalId: { startsWith: "parsa:product:" },
    prices: { none: {} },
  },
});
console.log(`\nparsa product 총 ${totalParsa}개, prices=0건: ${noPriceParsa}개`);

await prisma.$disconnect();
