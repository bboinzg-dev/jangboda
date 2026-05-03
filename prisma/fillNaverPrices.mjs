// Naver 쇼핑 → 우리 카탈로그 product에 온라인몰 가격 채움 (로컬 직접)
// /api/sync/naver는 product당 5초라 Vercel 60초 limit으로 chain self-trigger 느림.
// 로컬에서 600개 한 번에 ~30분 안에 완료.
//
// 실행: node prisma/fillNaverPrices.mjs

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const envText = readFileSync(".env", "utf-8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
  if (m) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const NAVER_ID = process.env.NAVER_SHOP_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_SHOP_CLIENT_SECRET;

if (!NAVER_ID || !NAVER_SECRET) {
  console.error("NAVER 키 미설정");
  process.exit(1);
}

const MAJOR_MALLS = new Set(["쿠팡", "G마켓", "옥션", "11번가", "SSG.COM", "마켓컬리", "위메프", "티몬", "네이버", "이마트몰", "홈플러스"]);

const MULTIPACK = [
  /\b[xX×]\s*[2-9]\b/, /\b[xX×]\s*\d{2,}\b/,
  /[2-9]\s*개\s*입/, /\d{2,}\s*개\s*입/,
  /[2-9]\s*개\s*묶음/, /[2-9]\s*개\s*세트/,
  /\b[2-9]\s*PACK/i, /[2-9]\s*박스/, /[2-9]\s*팩/, /\d{2,}\s*팩/,
  /\(\s*[2-9]\s*개\s*\)/, /\bDOZEN\b/i, /번들\s*[2-9]/,
];
const isMultiPack = (t) => MULTIPACK.some((r) => r.test(t));

function tokenize(s) {
  return s
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^가-힣a-zA-Z0-9]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !/^(kg|g|ml|L|개|입|봉|병|캔|팩|개입)$/i.test(t));
}

function isMatchTitle(title, productTokens) {
  if (productTokens.length === 0) return false;
  const tl = title.toLowerCase();
  const hits = productTokens.filter((t) => tl.includes(t.toLowerCase())).length;
  // 토큰 1개면 1개, 2개 이상이면 ≥2개 일치
  const required = productTokens.length === 1 ? 1 : 2;
  return hits >= required;
}

// product.unit에서 핵심 사이즈 키워드 추출 (정규화)
// "2L" → ["2L", "2l"]
// "30구" → ["30구", "30개", "30입"]
// "100g" → ["100g"]
// "210g x 12개" → ["210g", "12개", "12입"]
// 매칭 결과: title에 이 중 ≥1 포함되어야 unit 매칭 통과
function extractSizeKeywords(unit) {
  if (!unit) return [];
  const u = unit.replace(/\s+/g, "").toLowerCase();
  const keywords = new Set();
  // 단위 + 숫자 패턴 추출
  const matches = u.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|L|구|개|입|봉|병|캔|팩|매|롤|장)/gi);
  if (matches) {
    for (const m of matches) {
      const cleaned = m.replace(/\s+/g, "");
      keywords.add(cleaned);
      // 동의어 보강
      if (cleaned.endsWith("구")) {
        const num = cleaned.replace("구", "");
        keywords.add(num + "개");
        keywords.add(num + "입");
      }
      if (cleaned.endsWith("개")) {
        const num = cleaned.replace("개", "");
        keywords.add(num + "구");
        keywords.add(num + "입");
      }
    }
  }
  return Array.from(keywords);
}

function isUnitMatch(title, sizeKws) {
  if (sizeKws.length === 0) return true; // unit 정보 없으면 통과
  const tl = title.toLowerCase().replace(/\s+/g, "");
  return sizeKws.some((kw) => tl.includes(kw.toLowerCase()));
}

function canonicalMall(name) {
  const n = (name || "").trim();
  if (n.includes("쿠팡")) return { canonical: "쿠팡", isMajor: true };
  if (n.includes("G마켓") || n.toLowerCase().includes("gmarket")) return { canonical: "G마켓", isMajor: true };
  if (n.includes("옥션") || n.toLowerCase() === "auction") return { canonical: "옥션", isMajor: true };
  if (n.includes("11번가")) return { canonical: "11번가", isMajor: true };
  if (n.toUpperCase().includes("SSG")) return { canonical: "SSG.COM", isMajor: true };
  if (n.includes("컬리") || n.toLowerCase().includes("kurly")) return { canonical: "마켓컬리", isMajor: true };
  if (n.includes("위메프")) return { canonical: "위메프", isMajor: true };
  if (n.includes("티몬")) return { canonical: "티몬", isMajor: true };
  if (n.includes("이마트")) return { canonical: "이마트몰", isMajor: true };
  if (n.includes("홈플러스")) return { canonical: "홈플러스 온라인", isMajor: true };
  return { canonical: "기타 온라인몰", isMajor: false };
}

async function searchNaver(query) {
  // sort=sim — 유사도 순. 가격순(asc)은 잡화 매칭 위험
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=30&sort=sim`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_ID,
      "X-Naver-Client-Secret": NAVER_SECRET,
    },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.items ?? []).map((it) => ({
    title: (it.title || "").replace(/<[^>]+>/g, ""),
    image: it.image || "",
    lprice: parseInt((it.lprice || "0").replace(/[^\d]/g, ""), 10) || 0,
    mallName: it.mallName || "기타",
    link: it.link || "",
  }));
}

async function ensureOnlineStore(canonicalName, isMajor) {
  const chain = await prisma.chain.upsert({
    where: { name: canonicalName },
    update: {},
    create: { name: canonicalName, category: "online" },
  });
  const storeName = isMajor ? `${canonicalName} 온라인몰` : "기타 온라인몰";
  let s = await prisma.store.findFirst({ where: { chainId: chain.id, name: storeName } });
  if (s) return s;
  return prisma.store.create({
    data: {
      chainId: chain.id,
      name: storeName,
      address: "온라인 (전국 배송)",
      lat: 0, lng: 0, hours: "24시간",
    },
  });
}

async function main() {
  const products = await prisma.product.findMany({
    where: { category: { not: "농수산물" } },
    select: { id: true, name: true, brand: true, unit: true },
  });
  console.log(`처리 대상: ${products.length}개\n`);

  const startedAt = Date.now();
  let processed = 0;
  let pricesAdded = 0;
  let noMatch = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const cleanName = p.name.replace(/\([^)]*\)/g, "").trim();
    const query = [p.brand, cleanName].filter(Boolean).join(" ").trim();
    const productTokens = tokenize(p.name);
    if (p.brand) productTokens.push(...tokenize(p.brand));
    const uniqueTokens = Array.from(new Set(productTokens));

    try {
      const items = await searchNaver(query);
      const sizeKws = extractSizeKeywords(p.unit);

      // 검증: title 토큰 매칭 + multipack 제외 + unit 매칭
      const validItems = items.filter((it) => {
        if (it.lprice <= 0) return false;
        if (isMultiPack(it.title)) return false;
        if (!isMatchTitle(it.title, uniqueTokens)) return false;
        if (!isUnitMatch(it.title, sizeKws)) return false;
        return true;
      });

      if (validItems.length === 0) {
        noMatch++;
        await new Promise((r) => setTimeout(r, 110));
        continue;
      }

      // mall별 최저가 1개씩
      const byMall = new Map();
      for (const it of validItems) {
        const cur = byMall.get(it.mallName);
        if (!cur || it.lprice < cur.lprice) byMall.set(it.mallName, it);
      }

      // imageUrl 없는 product는 첫 valid item의 image 채움 (한번에)
      const firstWithImage = validItems.find((it) => it.image);
      if (firstWithImage) {
        await prisma.product.updateMany({
          where: { id: p.id, imageUrl: null },
          data: { imageUrl: firstWithImage.image },
        });
      }

      for (const it of byMall.values()) {
        const { canonical, isMajor } = canonicalMall(it.mallName);
        const store = await ensureOnlineStore(canonical, isMajor);
        await prisma.price.deleteMany({
          where: { productId: p.id, storeId: store.id, source: "naver" },
        });
        await prisma.price.create({
          data: {
            productId: p.id,
            storeId: store.id,
            price: it.lprice,
            source: "naver",
            productUrl: it.link || null,
          },
        });
        pricesAdded++;
      }
      processed++;
    } catch (e) {
      console.warn(`  ✗ ${p.name}: ${e.message}`);
    }

    if ((i + 1) % 30 === 0) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(`  [${i + 1}/${products.length}] ${processed} 처리, ${pricesAdded} prices, ${noMatch} noMatch (${elapsed}s)`);
    }
    await new Promise((r) => setTimeout(r, 110));
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n총 ${processed}/${products.length} 처리, ${pricesAdded} prices 추가, ${noMatch} 매칭 없음 (${elapsed}초)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => prisma.$disconnect());
