// 일회성 정리: 시드/사용자 row(externalId=null)와 parsa 미러 row가 갈라진
// 매장 쌍을 머지한다. 정규화된 이름이 일치하는 쌍을 찾아서:
//   1. 시드 row를 참조하는 Receipt.storeId를 parsa row id로 옮긴다
//   2. 시드 row를 참조하는 FavoriteStore도 옮긴다 (parsa쪽에 이미 있으면 시드쪽 삭제)
//   3. 시드 row를 삭제 (Price는 Cascade로 함께 정리)
//
// 안전장치:
//   - 시드 row가 가진 Price > 0 이면 머지 보류 (수동 처리 필요)
//   - 시드 row와 parsa row 둘 다 동일 사용자의 즐겨찾기에 있으면 시드쪽 즐겨찾기는 삭제
//
// 사용: npx tsx scripts/merge_duplicate_stores.ts
//   (실행 전 DRY_RUN=1 npx tsx scripts/merge_duplicate_stores.ts 로 미리보기)

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const DRY_RUN = process.env.DRY_RUN === "1";

function normName(s: string): string {
  return s.toLowerCase().replace(/[\s\-_·.()]+/g, "");
}

async function main() {
  const noExt = await prisma.store.findMany({
    where: { externalId: null },
    select: { id: true, name: true, address: true },
  });
  const parsaRows = await prisma.store.findMany({
    where: { externalId: { startsWith: "parsa:" } },
    select: { id: true, name: true, externalId: true, address: true },
  });
  const parsaByKey = new Map<string, typeof parsaRows[number]>();
  for (const r of parsaRows) parsaByKey.set(normName(r.name), r);

  const pairs: Array<{
    seed: typeof noExt[number];
    parsa: typeof parsaRows[number];
  }> = [];
  for (const seed of noExt) {
    const match = parsaByKey.get(normName(seed.name));
    if (match) pairs.push({ seed, parsa: match });
  }

  console.log(`갈라진 매장 쌍: ${pairs.length}개${DRY_RUN ? "  (DRY RUN)" : ""}\n`);

  let mergedReceipts = 0;
  let movedFavorites = 0;
  let droppedFavorites = 0;
  let deletedSeed = 0;
  let skipped = 0;

  for (const { seed, parsa } of pairs) {
    const seedPrices = await prisma.price.count({ where: { storeId: seed.id } });
    if (seedPrices > 0) {
      console.log(`[SKIP] ${seed.name}  시드 row에 가격 ${seedPrices}건 있음 — 수동 머지 필요`);
      skipped++;
      continue;
    }

    const seedReceipts = await prisma.receipt.count({ where: { storeId: seed.id } });
    const seedFavs = await prisma.favoriteStore.findMany({
      where: { storeId: seed.id },
      select: { userId: true },
    });

    console.log(
      `[MERGE] ${seed.name} → ${parsa.name} (${parsa.externalId})  receipts=${seedReceipts} favs=${seedFavs.length}`
    );

    if (DRY_RUN) continue;

    // 1) Receipt.storeId 이동
    if (seedReceipts > 0) {
      const r = await prisma.receipt.updateMany({
        where: { storeId: seed.id },
        data: { storeId: parsa.id },
      });
      mergedReceipts += r.count;
    }

    // 2) FavoriteStore 이동 — userId 충돌 시 시드쪽 삭제
    for (const fav of seedFavs) {
      const existing = await prisma.favoriteStore.findUnique({
        where: { userId_storeId: { userId: fav.userId, storeId: parsa.id } },
      });
      if (existing) {
        await prisma.favoriteStore.delete({
          where: { userId_storeId: { userId: fav.userId, storeId: seed.id } },
        });
        droppedFavorites++;
      } else {
        await prisma.favoriteStore.update({
          where: { userId_storeId: { userId: fav.userId, storeId: seed.id } },
          data: { storeId: parsa.id },
        });
        movedFavorites++;
      }
    }

    // 3) 시드 row 삭제 (Price 0건이므로 Cascade로 깨끗이 정리됨)
    await prisma.store.delete({ where: { id: seed.id } });
    deletedSeed++;
  }

  console.log("\n=== 결과 ===");
  console.log(`  머지된 쌍 : ${deletedSeed}`);
  console.log(`  스킵       : ${skipped}`);
  console.log(`  영수증 이동: ${mergedReceipts}`);
  console.log(`  즐찾 이동  : ${movedFavorites}`);
  console.log(`  즐찾 삭제  : ${droppedFavorites}  (parsa쪽에 이미 즐찾 있던 경우)`);
}

main().finally(() => prisma.$disconnect());
