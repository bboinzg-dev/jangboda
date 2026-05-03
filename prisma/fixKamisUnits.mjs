// KAMIS sync 버그로 잘못 저장된 Product.unit 정정
// 예: 돼지고기 삼겹살 unit="1100g" → "100g"
// 실행: npx tsx prisma/fixKamisUnits.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// KAMIS_TARGETS와 동일 — 정정 대상 product name → 올바른 unit
const FIX_MAP = {
  "양배추": "1포기",
  "배추": "1포기",
  "무": "1개",
  "감자": "1kg",
  "양파": "1kg",
  "대파": "1단",
  "마늘": "1kg",
  "사과": "10개",
  "배": "10개",
  "쇠고기(한우 등심)": "100g",
  "돼지고기(삼겹살)": "100g",
  "계란": "30구",
};

async function main() {
  let fixed = 0;
  for (const [name, correctUnit] of Object.entries(FIX_MAP)) {
    const products = await prisma.product.findMany({
      where: { name },
      select: { id: true, name: true, unit: true },
    });
    for (const p of products) {
      if (p.unit !== correctUnit) {
        console.log(`  ${p.name}: "${p.unit}" → "${correctUnit}"`);
        await prisma.product.update({
          where: { id: p.id },
          data: { unit: correctUnit },
        });
        fixed++;
      }
    }
  }
  console.log(`✅ ${fixed}개 product.unit 정정 완료`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
