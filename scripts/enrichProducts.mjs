// 시드 12개 상품에 manufacturer/origin/grade 보강
// (시드는 이미 돌아갔으니 update로 채움)
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// 가공식품 — 한국 식품/제조사 표준
const ENRICHMENT = [
  {
    matchName: "농심 신라면 멀티팩",
    data: {
      manufacturer: "(주)농심",
      origin: "대한민국",
      certifications: ["HACCP"],
      description: "120g x 5개입 / 매운맛",
    },
  },
  {
    matchName: "오뚜기 진라면 매운맛",
    data: {
      manufacturer: "(주)오뚜기",
      origin: "대한민국",
      certifications: ["HACCP"],
      description: "120g x 5개입",
    },
  },
  {
    matchName: "서울우유 흰우유",
    data: {
      manufacturer: "서울우유협동조합",
      origin: "대한민국",
      certifications: ["HACCP"],
      description: "1급 A등급 원유 100%",
    },
  },
  {
    matchName: "매일우유 저지방",
    data: {
      manufacturer: "매일유업(주)",
      origin: "대한민국",
      certifications: ["HACCP"],
      description: "지방 2% 이하",
    },
  },
  {
    matchName: "CJ 햇반 백미밥",
    data: {
      manufacturer: "CJ제일제당(주)",
      origin: "대한민국",
      certifications: ["HACCP"],
      description: "210g x 12개입 / 백미",
    },
  },
  {
    matchName: "동원 참치 살코기",
    data: {
      manufacturer: "동원F&B(주)",
      origin: "원양산 가다랑어",
      certifications: ["HACCP", "MSC"],
      description: "150g x 3캔",
    },
  },
  {
    matchName: "코카콜라 1.5L",
    data: {
      manufacturer: "한국코카콜라(주)",
      origin: "대한민국 제조",
      description: "1.5L 페트병",
    },
  },
  {
    matchName: "삼다수 생수",
    data: {
      manufacturer: "제주특별자치도개발공사",
      origin: "제주",
      certifications: ["NSF"],
      description: "2L x 6병",
    },
  },
  {
    matchName: "한우 등심 1등급",
    data: {
      brand: "정육",
      manufacturer: "축산물공판장",
      origin: "국내산 한우",
      grade: "1등급",
      certifications: ["축산물 이력제"],
      description: "100g 단가",
    },
  },
  {
    matchName: "친환경 계란 대란",
    data: {
      manufacturer: "농협중앙회",
      origin: "국내산",
      grade: "대란",
      certifications: ["친환경", "동물복지"],
      description: "30구 / 친환경 인증",
    },
  },
  {
    matchName: "스팸 클래식",
    data: {
      manufacturer: "CJ제일제당(주)",
      origin: "한국 제조 (원료 미국)",
      certifications: ["HACCP"],
      description: "200g x 4캔",
    },
  },
  {
    matchName: "풀무원 두부 찌개용",
    data: {
      manufacturer: "(주)풀무원",
      origin: "국산 콩 100%",
      certifications: ["HACCP", "Non-GMO"],
      description: "300g / 찌개용",
    },
  },
];

let updated = 0;
for (const e of ENRICHMENT) {
  const result = await prisma.product.updateMany({
    where: { name: e.matchName },
    data: e.data,
  });
  if (result.count > 0) {
    updated += result.count;
    console.log(`✓ ${e.matchName}`);
  } else {
    console.log(`- ${e.matchName} (없음)`);
  }
}

// 농수산물 (KAMIS 자동 등록된 것)에 기본값 채움
const kamisItems = await prisma.product.findMany({
  where: { category: "농수산물" },
  select: { id: true, name: true, manufacturer: true },
});
for (const p of kamisItems) {
  if (p.manufacturer) continue;
  await prisma.product.update({
    where: { id: p.id },
    data: {
      manufacturer: "KAMIS 전국 평균",
      origin: "국내산 (변동)",
      description: `${p.name} 전국 평균 시세 — 매장별 산지·등급은 다름`,
    },
  });
  console.log(`  + KAMIS 농수산물: ${p.name}`);
}

console.log(`\n✅ 총 ${updated}개 가공식품 + ${kamisItems.length}개 농수산물 보강`);
await prisma.$disconnect();
