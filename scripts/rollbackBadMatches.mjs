import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const toReset = ["농심 신라면 멀티팩", "CJ 햇반 백미밥", "삼다수 생수"];
for (const name of toReset) {
  const r = await p.product.updateMany({ where: { name }, data: { barcode: null } });
  console.log(`reset ${name}: ${r.count}건`);
}
await p.$disconnect();
