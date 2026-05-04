// 같은 (chainId, name, address) 중복 store 정리
// - 가격 데이터를 가장 오래된 store로 통합
// - 중복 store 삭제
//
// 실행: node prisma/dedupStores.mjs [--apply]

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const stores = await prisma.store.findMany({
  orderBy: { createdAt: "asc" },
  include: { _count: { select: { prices: true, receipts: true } } },
});

// (chainId, normalized_name, normalized_address) 키로 그룹화
function norm(s) {
  return (s ?? "").toLowerCase().replace(/\s+/g, "").trim();
}

const groups = new Map();
for (const s of stores) {
  const key = `${s.chainId}::${norm(s.name)}::${norm(s.address)}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(s);
}

const dups = Array.from(groups.values()).filter((arr) => arr.length > 1);
console.log(`중복 그룹: ${dups.length}개`);

let migratedPrices = 0;
let migratedReceipts = 0;
let deletedStores = 0;

for (const group of dups) {
  // 가장 오래된 store(첫 번째)를 보존, 나머지는 가격/영수증 이관 후 삭제
  const [keep, ...remove] = group;
  console.log(
    `\n  ${keep.name} (${keep.address}) — 보존: ${keep.id} (prices=${keep._count.prices}, receipts=${keep._count.receipts})`
  );
  for (const r of remove) {
    console.log(
      `    삭제 예정: ${r.id} (prices=${r._count.prices}, receipts=${r._count.receipts})`
    );
    if (APPLY) {
      // Prices migrate
      const m1 = await prisma.price.updateMany({
        where: { storeId: r.id },
        data: { storeId: keep.id },
      });
      migratedPrices += m1.count;
      // Receipts migrate
      const m2 = await prisma.receipt.updateMany({
        where: { storeId: r.id },
        data: { storeId: keep.id },
      });
      migratedReceipts += m2.count;
      // FavoriteStore migrate
      try {
        await prisma.favoriteStore.updateMany({
          where: { storeId: r.id },
          data: { storeId: keep.id },
        });
      } catch {
        await prisma.favoriteStore.deleteMany({ where: { storeId: r.id } });
      }
      // Store 삭제
      await prisma.store.delete({ where: { id: r.id } });
      deletedStores++;
    }
  }
}

console.log(
  `\n${APPLY ? "✅ 완료" : "🔍 dry-run"}: prices ${migratedPrices}건 이관, receipts ${migratedReceipts}건 이관, ${deletedStores}개 store 삭제`
);

await prisma.$disconnect();
