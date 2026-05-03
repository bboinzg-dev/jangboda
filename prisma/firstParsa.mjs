import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const ps = await prisma.product.findMany({
  where: { externalId: { startsWith: "parsa:product:" } },
  orderBy: { createdAt: "asc" },
  take: 5,
  select: { name: true, brand: true, manufacturer: true, barcode: true },
});
ps.forEach(p => console.log(`  ${p.name} | brand=${p.brand} | mfr=${p.manufacturer} | barcode=${p.barcode}`));
await prisma.$disconnect();
