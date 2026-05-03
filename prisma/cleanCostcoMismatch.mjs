// Costco 잘못된 가격 제거 — 시드의 코스트코 항목은 일반 마트 SKU와 패키징이 달라 비교 불가
// 코스트코 신라면=120gx30, 스팸=200gx20 등 별도 SKU 라 우리 단일 SKU에서 빼야 함.
//
// 실행: npx tsx prisma/cleanCostcoMismatch.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1) 코스트코 양재점 (또는 코스트코 chain의 모든 store) 식별
  const costcoStores = await prisma.store.findMany({
    where: { chain: { name: "코스트코" } },
    select: { id: true, name: true },
  });

  if (costcoStores.length === 0) {
    console.log("코스트코 매장 없음 — skip");
    await prisma.$disconnect();
    return;
  }

  console.log(`코스트코 매장 ${costcoStores.length}곳:`, costcoStores.map((s) => s.name));

  // 2) 코스트코 매장의 source="seed" Price 모두 삭제
  //    (이 가격들은 다른 패키징의 가격이라 같은 SKU로 비교 무의미)
  const result = await prisma.price.deleteMany({
    where: {
      storeId: { in: costcoStores.map((s) => s.id) },
      source: "seed",
    },
  });

  console.log(`✅ 코스트코 시드 가격 ${result.count}개 삭제 완료`);

  // 3) 영수증/사용자 등록 (source="receipt"|"manual") 가격은 유지 — 사용자가 실제 사서 인식한 가격은 정확함
  const remaining = await prisma.price.count({
    where: { storeId: { in: costcoStores.map((s) => s.id) } },
  });
  console.log(`코스트코 매장에 남은 가격: ${remaining}개 (영수증/수동 등록은 보존)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
