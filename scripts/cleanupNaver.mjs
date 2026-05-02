// 이전에 들어간 noisy naver 가격 정리 + 빈 온라인 가상 매장 정리
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const deletedPrices = await prisma.price.deleteMany({ where: { source: "naver" } });
console.log(`✅ 삭제된 naver 가격: ${deletedPrices.count}건`);

// 가격이 0건인 온라인 매장(쿠팡 등) 정리
const orphanStores = await prisma.store.findMany({
  where: { lat: 0, lng: 0, prices: { none: {} } },
  include: { chain: true },
});
for (const s of orphanStores) {
  await prisma.store.delete({ where: { id: s.id } });
  console.log(`  - 정리: ${s.chain.name} / ${s.name}`);
}

// 비어있는 온라인 체인 정리
const orphanChains = await prisma.chain.findMany({
  where: { stores: { none: {} } },
});
for (const c of orphanChains) {
  await prisma.chain.delete({ where: { id: c.id } });
  console.log(`  - 정리: 빈 체인 "${c.name}"`);
}

await prisma.$disconnect();
