// 시드 데이터: 한국 주요 마트 체인 + 대표 매장 + 인기 상품 + 초기 가격 샘플
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 시드 데이터 주입 시작...");

  // 1. 마트 체인 + 편의점 체인
  const chainData = [
    { name: "롯데마트", category: "mart" },
    { name: "킴스클럽", category: "mart" },
    { name: "이마트", category: "mart" },
    { name: "홈플러스", category: "mart" },
    { name: "코스트코", category: "mart" },
    { name: "GS더프레시", category: "mart" },
    { name: "CU", category: "convenience" },
    { name: "GS25", category: "convenience" },
    { name: "세븐일레븐", category: "convenience" },
    { name: "이마트24", category: "convenience" },
    { name: "MINISTOP", category: "convenience" },
  ];
  const chains = await Promise.all(
    chainData.map((c) =>
      prisma.chain.upsert({
        where: { name: c.name },
        update: { category: c.category },
        create: c,
      })
    )
  );

  const chainMap = Object.fromEntries(chains.map((c) => [c.name, c.id]));

  // 2. 매장 (서울 강남/송파 인근 샘플)
  const stores = [
    {
      chain: "롯데마트",
      name: "롯데마트 잠실점",
      address: "서울 송파구 올림픽로 240",
      lat: 37.5132,
      lng: 127.1029,
      hours: "10:00~24:00",
    },
    {
      chain: "킴스클럽",
      name: "킴스클럽 강남점",
      address: "서울 강남구 테헤란로 152",
      lat: 37.5006,
      lng: 127.0364,
      hours: "10:00~23:00",
    },
    {
      chain: "이마트",
      name: "이마트 성수점",
      address: "서울 성동구 뚝섬로 273",
      lat: 37.5446,
      lng: 127.0567,
      hours: "10:00~23:00",
    },
    {
      chain: "홈플러스",
      name: "홈플러스 잠실점",
      address: "서울 송파구 새말로 28",
      lat: 37.5081,
      lng: 127.0950,
      hours: "10:00~24:00",
    },
    {
      chain: "코스트코",
      name: "코스트코 양재점",
      address: "서울 서초구 양재대로 159",
      lat: 37.4691,
      lng: 127.0388,
      hours: "10:00~22:00",
    },
    {
      chain: "GS더프레시",
      name: "GS더프레시 송파점",
      address: "서울 송파구 백제고분로 362",
      lat: 37.5074,
      lng: 127.1119,
      hours: "08:00~23:00",
    },
  ];

  const storeRecords = await Promise.all(
    stores.map((s) =>
      prisma.store.create({
        data: {
          chainId: chainMap[s.chain],
          name: s.name,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          hours: s.hours,
        },
      })
    )
  );
  const storeMap = Object.fromEntries(
    storeRecords.map((s) => [s.name, s.id])
  );

  // 3. 인기 상품 카탈로그
  const products = [
    {
      name: "농심 신라면 멀티팩",
      brand: "농심",
      category: "라면/면류",
      unit: "120g x 5개",
      aliases: ["신라면 5입", "신라면 멀티", "농심 신라면 5개입"],
    },
    {
      name: "오뚜기 진라면 매운맛",
      brand: "오뚜기",
      category: "라면/면류",
      unit: "120g x 5개",
      aliases: ["진라면 매운맛", "진라면 매운 5입"],
    },
    {
      name: "서울우유 흰우유",
      brand: "서울우유",
      category: "유제품",
      unit: "1L",
      aliases: ["서울우유 1L", "서울우유 흰우유 1L"],
    },
    {
      name: "매일우유 저지방",
      brand: "매일",
      category: "유제품",
      unit: "900ml",
      aliases: ["매일 저지방우유", "매일유업 저지방"],
    },
    {
      name: "CJ 햇반 백미밥",
      brand: "CJ제일제당",
      category: "즉석밥",
      unit: "210g x 12개",
      aliases: ["햇반 12입", "햇반 210g 12개"],
    },
    {
      name: "동원 참치 살코기",
      brand: "동원",
      category: "통조림",
      unit: "150g x 3캔",
      aliases: ["동원참치 살코기 3캔", "참치 살코기"],
    },
    {
      name: "코카콜라 1.5L",
      brand: "코카콜라",
      category: "음료",
      unit: "1.5L",
      aliases: ["코카콜라 1.5", "코크 1.5L"],
    },
    {
      name: "삼다수 생수",
      brand: "제주삼다수",
      category: "음료",
      unit: "2L x 6병",
      aliases: ["삼다수 2L 6입", "삼다수 6병"],
    },
    {
      name: "한우 등심 1등급",
      brand: "정육",
      category: "정육",
      unit: "100g",
      // KAMIS 호환 alias 포함 — 동기화 시 같은 상품으로 매칭됨
      aliases: ["한우 등심 100g", "1등급 등심", "쇠고기(한우 등심)"],
    },
    {
      name: "친환경 계란 대란",
      brand: "농협",
      category: "계란/유제품",
      unit: "30구",
      aliases: ["계란 30구", "대란 30구", "계란"],
    },
    {
      name: "스팸 클래식",
      brand: "CJ제일제당",
      category: "통조림",
      unit: "200g x 4개",
      aliases: ["스팸 200g 4개", "스팸 클래식 4입"],
    },
    {
      name: "풀무원 두부 찌개용",
      brand: "풀무원",
      category: "두부/유부",
      unit: "300g",
      aliases: ["풀무원 두부", "찌개두부 300g"],
    },
  ];

  const productRecords: { id: string; name: string }[] = [];
  for (const p of products) {
    const product = await prisma.product.create({
      data: {
        name: p.name,
        brand: p.brand,
        category: p.category,
        unit: p.unit,
        aliases: {
          create: p.aliases.map((a) => ({ alias: a })),
        },
      },
    });
    productRecords.push({ id: product.id, name: product.name });
  }

  // 4. 가격 샘플 — 매장별로 약간씩 다르게
  const priceMatrix: Record<string, Record<string, number>> = {
    // 코스트코는 별도 SKU (120g x 30개 박스 등) — 같은 SKU 비교 불가라 제외
    "농심 신라면 멀티팩": {
      "롯데마트 잠실점": 4480,
      "킴스클럽 강남점": 4280,
      "이마트 성수점": 4380,
      "홈플러스 잠실점": 4180,
      "GS더프레시 송파점": 4680,
    },
    "오뚜기 진라면 매운맛": {
      "롯데마트 잠실점": 3680,
      "킴스클럽 강남점": 3580,
      "이마트 성수점": 3480,
      "홈플러스 잠실점": 3580,
      "GS더프레시 송파점": 3880,
    },
    "서울우유 흰우유": {
      "롯데마트 잠실점": 2890,
      "킴스클럽 강남점": 2780,
      "이마트 성수점": 2890,
      "홈플러스 잠실점": 2780,
      "GS더프레시 송파점": 3100,
    },
    "매일우유 저지방": {
      "롯데마트 잠실점": 2680,
      "이마트 성수점": 2580,
      "홈플러스 잠실점": 2680,
      "GS더프레시 송파점": 2880,
    },
    // 코스트코는 36개 박스 등 별도 SKU
    "CJ 햇반 백미밥": {
      "롯데마트 잠실점": 13800,
      "킴스클럽 강남점": 13500,
      "이마트 성수점": 13900,
      "홈플러스 잠실점": 13500,
    },
    "동원 참치 살코기": {
      "롯데마트 잠실점": 5680,
      "킴스클럽 강남점": 5480,
      "이마트 성수점": 5580,
      "홈플러스 잠실점": 5380,
    },
    "코카콜라 1.5L": {
      "롯데마트 잠실점": 2980,
      "킴스클럽 강남점": 2880,
      "이마트 성수점": 2980,
      "홈플러스 잠실점": 2880,
      "GS더프레시 송파점": 3180,
    },
    // 코스트코는 12병 묶음 등 별도 SKU
    "삼다수 생수": {
      "롯데마트 잠실점": 6980,
      "킴스클럽 강남점": 6780,
      "이마트 성수점": 6980,
      "홈플러스 잠실점": 6580,
    },
    "한우 등심 1등급": {
      "롯데마트 잠실점": 12800,
      "이마트 성수점": 11900,
      "홈플러스 잠실점": 12500,
    },
    "친환경 계란 대란": {
      "롯데마트 잠실점": 8980,
      "킴스클럽 강남점": 8780,
      "이마트 성수점": 8580,
      "홈플러스 잠실점": 8480,
      "GS더프레시 송파점": 9280,
    },
    // 코스트코는 200g x 20캔 박스 / 340g x 6 등 별도 SKU
    "스팸 클래식": {
      "롯데마트 잠실점": 12800,
      "킴스클럽 강남점": 12500,
      "이마트 성수점": 12900,
      "홈플러스 잠실점": 12300,
    },
    "풀무원 두부 찌개용": {
      "롯데마트 잠실점": 2380,
      "이마트 성수점": 2280,
      "홈플러스 잠실점": 2280,
      "GS더프레시 송파점": 2580,
    },
  };

  let priceCount = 0;
  for (const [productName, byStore] of Object.entries(priceMatrix)) {
    const product = productRecords.find((p) => p.name === productName);
    if (!product) continue;
    for (const [storeName, price] of Object.entries(byStore)) {
      const storeId = storeMap[storeName];
      if (!storeId) continue;
      await prisma.price.create({
        data: {
          productId: product.id,
          storeId,
          listPrice: price,
          source: "seed",
        },
      });
      priceCount++;
    }
  }

  // 5. 데모 사용자
  await prisma.user.upsert({
    where: { nickname: "데모유저" },
    update: {},
    create: { nickname: "데모유저", points: 120 },
  });

  console.log(
    `✅ 완료: 체인 ${chains.length}, 매장 ${storeRecords.length}, 상품 ${productRecords.length}, 가격 ${priceCount}건`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
