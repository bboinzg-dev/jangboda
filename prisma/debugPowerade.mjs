import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const matches = await prisma.product.findMany({
  where: { name: { contains: "파워에이드" } },
  include: {
    prices: { include: { store: { include: { chain: true } } }, orderBy: { price: "asc" } },
  },
});

for (const p of matches) {
  console.log(`\n=== ${p.name} (id: ${p.id}) ===`);
  console.log(`brand: ${p.brand}, unit: ${p.unit}, category: ${p.category}`);
  console.log(`prices: ${p.prices.length}건`);
  for (const pr of p.prices) {
    console.log(`  ${pr.price}원 [${pr.source}] ${pr.store?.chain?.name} | ${pr.store?.name}`);
  }
}

if (matches.length === 0) console.log("파워에이드 product 없음");

await prisma.$disconnect();
