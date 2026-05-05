// Phase 6.2: Price 모델의 새 필드(listPrice/paidPrice/promotionType) 백필
//
// 배경: Phase 1에서 Price에 새 필드를 추가했고 Phase 6.1에서 모든 sync write가
// 새 필드를 채우도록 수정했음. 이 스크립트는 그 이전에 들어와 있는 행(listPrice IS NULL)에
// 기존 price/isOnSale 값을 옮겨담아 일관성을 확보.
//
// 매핑:
//   listPrice ← price (정가 가정)
//   paidPrice ← isOnSale ? price : null (행사가 별도 정보 없으면 정가 = 행사가로 가정)
//   promotionType ← isOnSale ? "할인" : null (구체 타입 정보 없음)
//
// 이후 Phase 6.4에서 price/isOnSale 컬럼을 drop하기 전에 한 번만 실행.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("[backfill] 시작 — Price.listPrice IS NULL 행 카운트 중...");
  const target = await prisma.price.count({ where: { listPrice: null } });
  console.log(`[backfill] 대상 ${target.toLocaleString()}건`);
  if (target === 0) {
    console.log("[backfill] 대상 없음. 종료.");
    return;
  }

  // 1) 정가 케이스 — isOnSale=false인 행: listPrice ← price
  const r1 = await prisma.price.updateMany({
    where: { listPrice: null, isOnSale: false },
    data: { listPrice: { set: undefined } /* placeholder, raw SQL 사용 */ },
  }).catch(() => null);
  // updateMany는 컬럼 간 복사를 지원 안 해서 raw SQL로 처리
  void r1;

  // 2) 정상가 행 (isOnSale=false): listPrice = price, paidPrice/promotionType = null
  const updNormal = await prisma.$executeRawUnsafe(`
    UPDATE "Price"
    SET "listPrice" = "price"
    WHERE "listPrice" IS NULL AND "isOnSale" = false
  `);
  console.log(`[backfill] 정상가 backfill: ${updNormal}건`);

  // 3) 행사가 행 (isOnSale=true): listPrice = price, paidPrice = price, promotionType = "할인"
  // (구체 promotionType 정보가 없으므로 일반 "할인"으로 기록)
  const updSale = await prisma.$executeRawUnsafe(`
    UPDATE "Price"
    SET "listPrice" = "price",
        "paidPrice" = "price",
        "promotionType" = '할인'
    WHERE "listPrice" IS NULL AND "isOnSale" = true
  `);
  console.log(`[backfill] 행사가 backfill: ${updSale}건`);

  const remaining = await prisma.price.count({ where: { listPrice: null } });
  console.log(`[backfill] 남은 NULL 건수: ${remaining}`);
  console.log("[backfill] 완료.");
}

main()
  .catch((e) => {
    console.error("[backfill] 에러:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
