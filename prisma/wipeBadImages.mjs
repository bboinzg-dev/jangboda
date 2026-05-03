// 잘못 매칭된 imageUrl 일괄 정리
// - 단독 원물(brand=null + 농수산물 키워드만 있는 product): Naver "sort=asc"로 잡화 매칭됨
// - title 토큰 검증 안 했던 케이스도 포함
//
// 실행: node prisma/wipeBadImages.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 단독 원물 키워드 — 이런 product에 매칭된 image는 거의 잡화/장식품
const SINGLE_INGREDIENT_NAMES = [
  "당근", "양배추", "배추", "양파", "감자", "고구마", "마늘", "생강",
  "사과", "배", "오이", "호박", "파", "쪽파", "대파", "상추", "시금치",
  "고추", "풋고추", "피망", "파프리카", "토마토", "딸기", "수박", "참외",
  "복숭아", "포도", "감", "귤", "단감", "키위", "블루베리",
  "콩", "땅콩", "잣", "호두", "아몬드",
  "쌀", "현미", "찹쌀", "보리쌀", "조", "수수", "기장",
  "고등어", "갈치", "오징어", "낙지", "꽁치",
  "닭고기", "돼지고기", "소고기", "한우", "삼겹살",
  "달걀", "계란",
];

// product.name이 단순히 위 키워드 + (괄호) 안 부가설명 형태인지 판단
function isPlainIngredient(name) {
  // 괄호와 공백 제거한 핵심 단어
  const core = name.replace(/\([^)]*\)/g, "").replace(/\s+/g, "").trim();
  // 핵심이 짧고(8자 이하) 단독 원물 키워드와 동일 또는 포함 시
  if (core.length > 8) return false;
  return SINGLE_INGREDIENT_NAMES.some((kw) => core === kw || core.startsWith(kw));
}

async function main() {
  // 1. 단독 원물 + brand 없음 + 이미지 있음 → 잡화 매칭 의심
  const candidates = await prisma.product.findMany({
    where: {
      brand: null,
      imageUrl: { not: null },
    },
    select: { id: true, name: true, imageUrl: true },
  });

  const badIds = candidates.filter((p) => isPlainIngredient(p.name));
  console.log(`잘못 매칭 의심 (단독 원물 + brand=null): ${badIds.length}건`);
  for (const p of badIds.slice(0, 20)) {
    console.log(`  ${p.name}: ${p.imageUrl?.slice(0, 60)}`);
  }

  if (badIds.length > 0) {
    const result = await prisma.product.updateMany({
      where: { id: { in: badIds.map((p) => p.id) } },
      data: { imageUrl: null },
    });
    console.log(`\n${result.count}건 imageUrl null로 wipe 완료`);
  }

  // 2. 통계 — 카테고리=농수산물 product도 확인
  console.log("\n=== 농수산물 카테고리 imageUrl 보유 ===");
  const farms = await prisma.product.findMany({
    where: {
      category: "농수산물",
      imageUrl: { not: null },
    },
    select: { name: true },
  });
  console.log(`${farms.length}건 — 이건 KAMIS 시세상품이라 별도 처리 필요`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
