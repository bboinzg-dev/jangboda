// "기타 온라인몰" Price row 일괄 삭제 + store/chain 정리
//
// 배경: canonicalMallName 미매칭 마이너 셀러가 "기타 온라인몰" 한 store에 묶여 들어옴.
// 단위·규격 검증이 안 되어 같은 product에 다른 사양 가격이 매핑됨 → 비교 부정확.
// UI에서 hide하고 있었지만 DB에 남아있어 헤더 통계 누수·차트 노이즈 유발.
//
// 사용:  node prisma/purgeOtherOnlineMall.mjs --dry  (미리보기)
//        node prisma/purgeOtherOnlineMall.mjs        (실행)
import { PrismaClient } from "@prisma/client";

const DRY = process.argv.includes("--dry");
const prisma = new PrismaClient();

const stores = await prisma.store.findMany({
  where: { name: "기타 온라인몰" },
  include: { chain: { select: { name: true } } },
});
console.log(`"기타 온라인몰" store: ${stores.length}개`);

let totalPrices = 0;
const storeIds = stores.map((s) => s.id);
if (storeIds.length > 0) {
  totalPrices = await prisma.price.count({
    where: { storeId: { in: storeIds } },
  });
}
console.log(`삭제 대상 price row: ${totalPrices}건`);

if (DRY) {
  console.log("DRY RUN — 변경 없음");
  await prisma.$disconnect();
  process.exit(0);
}

if (storeIds.length === 0) {
  console.log("삭제할 데이터 없음");
  await prisma.$disconnect();
  process.exit(0);
}

// 1) Price 삭제
const priceDel = await prisma.price.deleteMany({
  where: { storeId: { in: storeIds } },
});
console.log(`✅ price 삭제: ${priceDel.count}건`);

// 2) Store 삭제 (다른 chain의 store는 안 건드림 — 이름이 정확히 "기타 온라인몰"인 것만)
const storeDel = await prisma.store.deleteMany({
  where: { id: { in: storeIds } },
});
console.log(`✅ store 삭제: ${storeDel.count}개`);

// 3) "기타 온라인몰" chain — 다른 store 없으면 정리
const orphanChainIds = [...new Set(stores.map((s) => s.chainId))];
for (const cid of orphanChainIds) {
  const remaining = await prisma.store.count({ where: { chainId: cid } });
  if (remaining === 0) {
    const chain = await prisma.chain.findUnique({
      where: { id: cid },
      select: { name: true },
    });
    if (chain?.name === "기타 온라인몰") {
      await prisma.chain.delete({ where: { id: cid } });
      console.log(`✅ chain 삭제: ${chain.name}`);
    }
  }
}

await prisma.$disconnect();
console.log("\n완료.");
