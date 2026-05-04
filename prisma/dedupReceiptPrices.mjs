// 같은 receiptId에 같은 productId가 여러 번 들어간 케이스 정리
// (PATCH idempotent fix 이전에 두 번 등록한 영수증 정리)
//
// 실행: node prisma/dedupReceiptPrices.mjs [--apply]

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const grouped = await prisma.price.groupBy({
  by: ["receiptId", "productId"],
  where: { receiptId: { not: null } },
  _count: true,
  having: { receiptId: { _count: { gt: 1 } } },
});

console.log(`중복 발견: ${grouped.length}건의 (receiptId, productId) pair`);

let toDelete = 0;
for (const g of grouped) {
  // 같은 (receiptId, productId)의 prices 모두 가져와서 가장 오래된 1개 빼고 삭제
  const prices = await prisma.price.findMany({
    where: { receiptId: g.receiptId, productId: g.productId },
    orderBy: { createdAt: "asc" },
    select: { id: true, price: true, createdAt: true },
  });
  // 첫 번째(가장 오래된)만 보존, 나머지 삭제
  const keep = prices[0];
  const remove = prices.slice(1);
  console.log(
    `  receipt=${g.receiptId} product=${g.productId}: ${prices.length}건 → 1건 (${remove.length}건 삭제, 보존=${keep.id})`
  );
  toDelete += remove.length;

  if (APPLY) {
    await prisma.price.deleteMany({
      where: { id: { in: remove.map((r) => r.id) } },
    });
  }
}

console.log(`\n총 ${toDelete}건 삭제 ${APPLY ? "완료" : "(dry-run, --apply로 실행)"}`);

await prisma.$disconnect();
