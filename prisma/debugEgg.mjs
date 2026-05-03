import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const PRODUCT_ID = "cmonoebza001blrsmr9b73dx2";

const product = await prisma.product.findUnique({
  where: { id: PRODUCT_ID },
});
console.log("=== Product ===");
console.log(`id: ${product.id}`);
console.log(`name: ${product.name}`);
console.log(`brand: ${product.brand}`);
console.log(`unit: ${product.unit}`);
console.log(`category: ${product.category}`);

const prices = await prisma.price.findMany({
  where: { productId: PRODUCT_ID },
  include: { store: { include: { chain: true } } },
  orderBy: { price: "asc" },
});

console.log(`\n=== 등록 가격 ${prices.length}건 (가격 오름차순) ===`);
for (const p of prices) {
  console.log(
    `  ${p.price.toString().padStart(6)}원 [${p.source.padEnd(15)}] ${p.store?.chain?.name ?? "?"} | ${p.store?.name ?? "?"}${p.productUrl ? "\n    URL: " + p.productUrl.slice(0, 100) : ""}`
  );
}

await prisma.$disconnect();
