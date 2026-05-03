// 통계청 매칭 정확도 강화: 카테고리 itemName이 product name에 포함되어야 매칭
//
// 기존 문제: ["농협", "친환경", "계란", "대란"] 토큰 중 2개 hit이면 매칭 →
//             "건강한 농협 친환경 김치" 같은 무관 row도 매칭되어 +648% 같은
//             이상한 가격이 등록됨
//
// 새 로직: 통계청 row의 카테고리(itemName, 예: "라면", "김치", "카레") 키워드가
//          우리 product name에 포함되어야 매칭. 카테고리 매칭이 보장된 후
//          token-match는 추가 검증.

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

const envText = readFileSync(".env", "utf-8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
  if (m) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const KEY = process.env.DATA_GO_KR_SERVICE_KEY;
const BASE = "http://apis.data.go.kr/1240000/bpp_openapi";

function parseTagAll(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}
function parseFields(block) {
  const f = {};
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(block)) !== null) f[m[1]] = m[2].trim();
  return f;
}

async function listFoodItems() {
  const url = `${BASE}/getPriceItemList?serviceKey=${KEY}&numOfRows=200&pageNo=1`;
  const res = await fetch(url);
  const xml = await res.text();
  return parseTagAll(xml, "item")
    .map(parseFields)
    .filter((f) => f.ic && f.in && f.ic.startsWith("A"))
    .map((f) => ({ itemCode: f.ic, itemName: f.in }));
}

async function getPrices(itemCode, date) {
  const url = `${BASE}/getPriceInfo?serviceKey=${KEY}&itemCode=${itemCode}&startDate=${date}&endDate=${date}&pageNo=1&numOfRows=1000`;
  const res = await fetch(url);
  const xml = await res.text();
  const code = xml.match(/<resultCode>(\d+)<\/resultCode>/)?.[1];
  if (code && code !== "00") return [];
  return parseTagAll(xml, "item")
    .map(parseFields)
    .filter((f) => f.pi && f.pn && f.sp)
    .map((f) => ({
      pn: f.pn,
      sp: parseInt(f.sp, 10) || 0,
      dp: parseInt(f.dp || f.sp, 10) || 0,
    }));
}

function tokenize(s) {
  return s
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^가-힣a-zA-Z0-9]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
}

// 멀티팩/박스/묶음 — 단일 SKU 가격이 아니라 N개 묶음 가격이라 단가 비교 부정확
const MULTIPACK = [
  /\b[xX×]\s*[2-9]\b/,                  // x2, X3, ×4
  /\b[xX×]\s*\d{2,}\b/,                  // x10, x20, x30
  /[2-9]\s*개\s*입/,                     // 5개입
  /\d{2,}\s*개\s*입/,                    // 30개입
  /[2-9]\s*개\s*묶음/,
  /[2-9]\s*개\s*세트/,
  /\b[2-9]\s*PACK/i,
  /\b[2-9]\s*BOX/i,
  /[2-9]\s*박스/,
  /\d+\s*[xX×]\s*\d+/,                   // 5x8 (박스 단위)
  /[2-9]\s*팩/,
  /\d{2,}\s*팩/,
  /번들\s*[2-9]/,
  /\bDOZEN\b/i,
  /더즌/,
  /(\d+)\s*개입\s*[xX×]\s*[2-9]/,
];
function isMultiPack(s) {
  return MULTIPACK.some((r) => r.test(s));
}

async function findLatestDate() {
  for (let d = 2; d <= 30; d++) {
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    const date = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, "0")}${String(dt.getDate()).padStart(2, "0")}`;
    const rows = await getPrices("A01110", date);
    if (rows.length > 0) return date;
  }
  return null;
}

async function main() {
  const date = await findLatestDate();
  if (!date) {
    console.error("최근 데이터 없음");
    return;
  }
  console.log(`기준 날짜: ${date}`);

  // 1. 기존 source=stats_official 모두 wipe
  const wiped = await prisma.price.deleteMany({
    where: { source: "stats_official" },
  });
  console.log(`기존 통계청 가격 ${wiped.count}건 wipe`);

  // 2. store 다시 가져오기 (이미 있을 것)
  const chain = await prisma.chain.findFirst({ where: { name: "통계청 시세" } });
  const store = chain
    ? await prisma.store.findFirst({
        where: { chainId: chain.id, name: "통계청 온라인 평균" },
      })
    : null;
  if (!store) {
    console.error("통계청 store 없음 — syncStats 먼저 실행");
    return;
  }

  // 3. 카테고리별로 처리, 카테고리 keyword가 product name에 포함된 경우만 매칭
  const items = await listFoodItems();
  const products = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, category: true },
  });

  const matchedByProduct = new Map();
  let totalRows = 0;
  let totalMatched = 0;

  for (const item of items) {
    const rows = await getPrices(item.itemCode, date);
    totalRows += rows.length;
    if (rows.length === 0) continue;

    const itemKeyword = item.itemName; // "라면", "김치", "카레" 등

    // 우리 카탈로그에서 itemKeyword가 name에 포함된 product만 후보
    const candidates = products.filter((p) => p.name.includes(itemKeyword));
    if (candidates.length === 0) continue;

    let catMatches = 0;
    for (const row of rows) {
      // row의 pn에도 itemKeyword 포함 (대부분 그럴 것 — 같은 카테고리니)
      if (!row.pn.includes(itemKeyword)) continue;
      // 멀티팩/박스 가격은 단일 SKU와 비교 불가 — skip
      if (isMultiPack(row.pn)) continue;

      for (const p of candidates) {
        const productTokens = tokenize(p.name);
        const pnLower = row.pn.toLowerCase();
        // 핵심 검증: product name 토큰 중 itemKeyword를 제외한 다른 specific 토큰
        // (예: "친환경 계란 대란"의 "친환경"/"대란")이 1개 이상 hit
        const otherTokens = productTokens.filter((t) => t !== itemKeyword);
        if (otherTokens.length === 0) {
          // 토큰이 itemKeyword 하나뿐이면 무조건 매칭 (예: 그냥 "쌀")
          const arr = matchedByProduct.get(p.id) ?? [];
          arr.push(row.dp || row.sp);
          matchedByProduct.set(p.id, arr);
          catMatches++;
          totalMatched++;
          continue;
        }
        const otherHits = otherTokens.filter((t) => pnLower.includes(t.toLowerCase())).length;
        if (otherHits >= 1) {
          const arr = matchedByProduct.get(p.id) ?? [];
          arr.push(row.dp || row.sp);
          matchedByProduct.set(p.id, arr);
          catMatches++;
          totalMatched++;
        }
      }
    }
    if (catMatches > 0) {
      console.log(`  ✓ ${item.itemCode} ${item.itemName}: ${rows.length}건 → ${catMatches}건 매칭 (후보 ${candidates.length}개)`);
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`\n총 ${totalRows}건 데이터, ${totalMatched}건 매칭, unique product ${matchedByProduct.size}개`);

  // 4. 중앙값으로 Price 등록
  let inserted = 0;
  for (const [productId, prices] of matchedByProduct.entries()) {
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    await prisma.price.create({
      data: {
        productId,
        storeId: store.id,
        price: median,
        source: "stats_official",
        metadata: { sampleCount: prices.length, date },
      },
    });
    inserted++;
  }
  console.log(`Price 추가: ${inserted}건`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => prisma.$disconnect());
