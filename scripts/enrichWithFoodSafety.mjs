// 식품안전나라 I2570 API로 시드 카탈로그 풍부화
// — 정확한 바코드 + 제조사 + 표준 카테고리 자동 채움
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

// .env 로드
const env = readFileSync(".env", "utf8");
const KEY = env.match(/^KOREANNET_API_KEY="([^"]+)"/m)?.[1] ?? env.match(/^FOODSAFETY_API_KEY="([^"]+)"/m)?.[1];
if (!KEY) {
  console.error(".env에 KOREANNET_API_KEY 또는 FOODSAFETY_API_KEY 없음");
  process.exit(1);
}

const prisma = new PrismaClient();

function normalize(s) {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[^가-힣a-z0-9]/g, "");
}

async function searchByName(query, limit = 10) {
  const url = `http://openapi.foodsafetykorea.go.kr/api/${KEY}/I2570/json/1/${limit}/PRDT_NM=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.I2570?.row ?? [];
}

function findBest(rows, productName, brand) {
  const targetN = normalize(productName);
  const brandN = brand ? normalize(brand) : "";
  let best = null;
  for (const r of rows) {
    const cName = normalize(r.PRDT_NM ?? "");
    const cMfr = normalize(r.CMPNY_NM ?? "");
    let score = 0;
    if (brandN && (cMfr.includes(brandN) || cName.includes(brandN))) score += 3;
    if (cName.length >= 4 && targetN.length >= 4) {
      if (cName.includes(targetN) || targetN.includes(cName)) score += 3;
    }
    if (!best || score > best.score) best = { row: r, score };
  }
  return best && best.score >= 3 ? best.row : null;
}

const products = await prisma.product.findMany({
  where: { category: { not: "농수산물" } }, // 농수산물은 식품안전나라 대상 아님
  select: { id: true, name: true, brand: true, barcode: true, manufacturer: true, category: true },
});

console.log(`총 ${products.length}개 가공식품 풍부화 시작...\n`);

let matched = 0;
let alreadyHasBarcode = 0;

for (const p of products) {
  if (p.barcode) {
    console.log(`✓ ${p.name} (이미 바코드 있음: ${p.barcode})`);
    alreadyHasBarcode++;
    continue;
  }
  // 검색어 후보들: brand 제외 + 가장 식별력 큰 키워드 (보통 첫 단어)
  // 식품안전나라는 단일 키워드가 잘 매칭됨
  const cleaned = (p.brand ? p.name.replace(p.brand, "") : p.name)
    .replace(/[()]/g, "")
    .trim();
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
  // 첫 번째와 두 번째 토큰을 후보로 (예: "신라면 멀티팩" → ["신라면", "멀티팩"])
  const candidates = [tokens[0], tokens.slice(0, 2).join(" "), p.name].filter(
    Boolean
  );

  process.stdout.write(`🔎 ${p.name} ... `);
  let rows = [];
  let usedQuery = "";
  try {
    for (const q of candidates) {
      const r = await searchByName(q, 15);
      if (r.length > 0) {
        rows = r;
        usedQuery = q;
        break;
      }
    }
    const best = findBest(rows, p.name, p.brand);
    if (best) {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          barcode: best.BRCD_NO || undefined,
          manufacturer: best.CMPNY_NM || p.manufacturer,
        },
      });
      matched++;
      console.log(
        `✅ "${usedQuery}" → ${best.PRDT_NM} | ${best.CMPNY_NM} | ${best.BRCD_NO}`
      );
    } else {
      console.log(`❌ 매칭 실패 ("${usedQuery}", ${rows.length}건 중 신뢰 낮음)`);
    }
  } catch (e) {
    console.log(`❌ 오류: ${e.message}`);
  }
  // API rate limit 보호
  await new Promise((r) => setTimeout(r, 200));
}

console.log(`\n✅ 매칭 ${matched}개, 이미 바코드 있음 ${alreadyHasBarcode}개, 실패 ${products.length - matched - alreadyHasBarcode}개`);
await prisma.$disconnect();
