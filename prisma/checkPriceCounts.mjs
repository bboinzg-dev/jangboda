import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const SEED_NAMES = ["농심 신라면 멀티팩","오뚜기 진라면 매운맛","서울우유 흰우유","매일우유 저지방","CJ 햇반 백미밥","동원 참치 살코기","코카콜라 1.5L","삼다수 생수","한우 등심 1등급","친환경 계란 대란","스팸 클래식","풀무원 두부 찌개용"];

const seeds = await prisma.product.findMany({
  where: { name: { in: SEED_NAMES } },
  select: { name: true, _count: { select: { prices: true } } },
});
console.log("=== 시드 12개 ===");
seeds.forEach(p => console.log(`  ${p.name}: ${p._count.prices}개 가격 row`));

console.log("\n=== ParsaProduct → Product (샘플 5개) ===");
const parsaSamples = await prisma.product.findMany({
  where: { externalId: { startsWith: "parsa:product:" } },
  select: { name: true, _count: { select: { prices: true } } },
  orderBy: { id: "asc" },
  take: 5,
});
parsaSamples.forEach(p => console.log(`  ${p.name}: ${p._count.prices}개 가격 row`));

const parsaTotal = await prisma.product.count({ where: { externalId: { startsWith: "parsa:product:" } } });
const parsaPriceTotal = await prisma.price.count({ where: { source: "parsa" } });
console.log(`\n총 parsa-mirrored product: ${parsaTotal}개`);
console.log(`총 parsa source 가격 row: ${parsaPriceTotal}개`);
await prisma.$disconnect();
