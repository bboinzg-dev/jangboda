import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

await p.chain.updateMany({ where: { name: { in: ["공공시세(KAMIS)"] } }, data: { category: "public" } });

await p.chain.updateMany({
  where: {
    name: {
      in: ["쿠팡", "G마켓", "지마켓", "SSG.COM", "SSG", "11번가", "옥션", "위메프", "티몬", "인터파크", "마켓컬리", "네이버쇼핑", "기타 온라인몰"],
    },
  },
  data: { category: "online" },
});

await p.chain.updateMany({
  where: { name: { in: ["CU", "GS25", "세븐일레븐", "이마트24", "MINISTOP"] } },
  data: { category: "convenience" },
});

await p.chain.updateMany({
  where: { name: { in: ["롯데마트", "킴스클럽", "이마트", "홈플러스", "코스트코", "GS더프레시"] } },
  data: { category: "mart" },
});

const all = await p.chain.findMany({ select: { name: true, category: true } });
console.log("--- 모든 체인 카테고리 ---");
all.forEach((c) => console.log(`${c.category.padEnd(11)}  ${c.name}`));

await p.$disconnect();
