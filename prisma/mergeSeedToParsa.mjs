// 시드 12개 product 중 ParsaProduct에 명확히 매칭되는 5개를 병합
// - 시드 매장 가격 row의 productId를 ParsaProduct.id로 변경
// - 시드 product의 alias를 ParsaProduct로 이전 (영수증 OCR 매칭 보존)
// - 시드 product 삭제 (PriceAlert 등 cascading)
//
// 7개는 parsa에 매칭 없어 그대로 유지.
//
// 실행: npx tsx prisma/mergeSeedToParsa.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 시드 name → ParsaProduct.name (확실히 같은 SKU인 것만)
const MERGE_MAP = {
  "농심 신라면 멀티팩": "신라면(5개입)",
  "오뚜기 진라면 매운맛": "진라면 매운맛(5개입)",
  "서울우유 흰우유": "서울우유 흰우유(1L)",
  "매일우유 저지방": "매일우유 저지방 1%(900ml)",
  "스팸 클래식": "스팸 클래식(200g)",
};

async function main() {
  let totalMoved = 0;
  let totalAliasMoved = 0;
  let totalDeleted = 0;

  for (const [seedName, parsaName] of Object.entries(MERGE_MAP)) {
    const seed = await prisma.product.findFirst({
      where: { name: seedName, externalId: null },
      include: { aliases: true, _count: { select: { prices: true } } },
    });
    const parsa = await prisma.product.findFirst({
      where: { name: parsaName, externalId: { startsWith: "parsa:product:" } },
      include: { _count: { select: { prices: true } } },
    });

    if (!seed) {
      console.log(`⚠️ 시드 [${seedName}] 없음 — skip`);
      continue;
    }
    if (!parsa) {
      console.log(`⚠️ ParsaProduct [${parsaName}] 없음 — skip`);
      continue;
    }

    console.log(`\n[${seedName}] (${seed._count.prices}건) → [${parsaName}] (${parsa._count.prices}건)`);

    // 1) 시드의 alias를 ParsaProduct로 이전 (이미 같은 alias 있으면 skip)
    for (const a of seed.aliases) {
      try {
        await prisma.productAlias.update({
          where: { id: a.id },
          data: { productId: parsa.id },
        });
        totalAliasMoved += 1;
      } catch {
        // unique constraint 위배 — 이미 ParsaProduct에 같은 alias 있음. 시드 alias 삭제.
        await prisma.productAlias.delete({ where: { id: a.id } });
      }
    }
    // 시드 name 자체도 alias로 추가 (영수증에 "농심 신라면 멀티팩" 그대로 인식 시 매칭)
    try {
      await prisma.productAlias.create({
        data: { productId: parsa.id, alias: seedName },
      });
      totalAliasMoved += 1;
    } catch {
      // 이미 있으면 skip
    }

    // 2) 시드 가격 row의 productId를 ParsaProduct로 변경
    const moved = await prisma.price.updateMany({
      where: { productId: seed.id },
      data: { productId: parsa.id },
    });
    totalMoved += moved.count;
    console.log(`  → ${moved.count} 가격 row 이전`);

    // 3) 시드 product 삭제 (cascade로 PriceAlert 등 정리)
    try {
      await prisma.product.delete({ where: { id: seed.id } });
      totalDeleted += 1;
      console.log(`  ✓ 시드 product 삭제`);
    } catch (e) {
      console.log(`  ⚠️ 삭제 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n✅ 완료: ${totalDeleted}개 시드 병합, ${totalMoved}개 가격 row 이전, ${totalAliasMoved}개 alias 이전`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
