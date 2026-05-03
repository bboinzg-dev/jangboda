import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const result = await prisma.price.deleteMany({ where: { source: "naver" } });
console.log(`Naver 가격 ${result.count}건 wipe`);

await prisma.$disconnect();
