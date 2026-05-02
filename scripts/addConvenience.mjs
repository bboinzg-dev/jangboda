import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const conveniences = ["CU", "GS25", "세븐일레븐", "이마트24", "MINISTOP"];
for (const name of conveniences) {
  await p.chain.upsert({
    where: { name },
    update: { category: "convenience" },
    create: { name, category: "convenience" },
  });
}

const all = await p.chain.findMany({
  where: { category: "convenience" },
  select: { name: true, category: true },
});
console.log(`✅ 편의점 체인 ${all.length}개:`, all.map((c) => c.name).join(", "));

await p.$disconnect();
