// 통계청 온라인 가격 → 우리 카탈로그 매칭 + Price 추가 (로컬 직접 실행)
//
// 실행: node prisma/syncStats.mjs
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

if (!KEY) {
  console.error("DATA_GO_KR_SERVICE_KEY 미설정");
  process.exit(1);
}

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

function matchToken(productTokens, pn) {
  if (productTokens.length === 0) return false;
  const pnLower = pn.toLowerCase();
  const hits = productTokens.filter((t) => pnLower.includes(t.toLowerCase())).length;
  const required = productTokens.length === 1 ? 1 : 2;
  return hits >= required;
}

async function findLatestDate() {
  for (let daysAgo = 2; daysAgo <= 30; daysAgo++) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const date = `${yyyy}${mm}${dd}`;
    const rows = await getPrices("A01110", date);
    if (rows.length > 0) return date;
  }
  return null;
}

async function ensureStatsStore() {
  const chain = await prisma.chain.upsert({
    where: { name: "통계청 시세" },
    update: {},
    create: { name: "통계청 시세", category: "public" },
  });
  let s = await prisma.store.findFirst({
    where: { chainId: chain.id, name: "통계청 온라인 평균" },
  });
  if (s) return s;
  return prisma.store.create({
    data: {
      chainId: chain.id,
      name: "통계청 온라인 평균",
      address: "온라인 (정부 수집)",
      lat: 0,
      lng: 0,
      hours: "—",
    },
  });
}

async function main() {
  console.log("=== 통계청 가격 동기화 ===");
  const date = await findLatestDate();
  if (!date) {
    console.error("최근 30일 내 데이터 없음");
    return;
  }
  console.log(`기준 날짜: ${date}`);

  const items = await listFoodItems();
  console.log(`식품 카테고리: ${items.length}개`);

  const products = await prisma.product.findMany({
    select: { id: true, name: true, brand: true },
  });
  console.log(`우리 카탈로그: ${products.length}개\n`);

  const productTokensMap = new Map(
    products.map((p) => [p.id, Array.from(new Set([
      ...tokenize(p.name),
      ...(p.brand ? tokenize(p.brand) : []),
    ]))])
  );

  const store = await ensureStatsStore();

  let totalRows = 0;
  let totalMatched = 0;
  const matchedByProduct = new Map(); // productId → prices[]

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rows = await getPrices(item.itemCode, date);
    totalRows += rows.length;
    if (rows.length === 0) continue;

    let catMatches = 0;
    for (const row of rows) {
      for (const p of products) {
        const tokens = productTokensMap.get(p.id) ?? [];
        if (matchToken(tokens, row.pn)) {
          const arr = matchedByProduct.get(p.id) ?? [];
          arr.push(row.dp || row.sp);
          matchedByProduct.set(p.id, arr);
          catMatches++;
          totalMatched++;
        }
      }
    }
    if (catMatches > 0) {
      console.log(`  ✓ ${item.itemCode} ${item.itemName}: ${rows.length}건 → ${catMatches}건 매칭`);
    }
    // rate limit 친화적으로 50ms 대기
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`\n총 ${items.length}개 카테고리, ${totalRows}건 데이터, ${totalMatched}건 token 매칭`);
  console.log(`unique product 매칭: ${matchedByProduct.size}개\n`);

  // 각 product에 중앙값 가격 등록
  let inserted = 0;
  for (const [productId, prices] of matchedByProduct.entries()) {
    const sorted = [...prices].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    await prisma.price.deleteMany({
      where: { productId, storeId: store.id, source: "stats_official" },
    });
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
  console.log(`Price 추가: ${inserted}건 (source=stats_official)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
