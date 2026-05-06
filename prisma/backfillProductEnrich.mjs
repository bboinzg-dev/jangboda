// 영수증 OCR로 만들어진 product를 일괄 보정
//
// 처리 순서:
//   1) OCR 잡음 이름 정리 ("C_ 자연애찬_일반" → "자연애찬")
//   2) 식약처 C005/I2570 lookup (가공식품·바코드 있는 것) — 무료
//   3) 네이버 쇼핑 검색 (이미지·brand·category 보강) — 무료, 일 25,000건
//   4) brand 사전 매칭 (마지막 fallback)
//
// 사용:
//   node prisma/backfillProductEnrich.mjs --dry            # 변경 미리보기만
//   node prisma/backfillProductEnrich.mjs --limit=20       # 20개만 처리
//   node prisma/backfillProductEnrich.mjs                  # 모두 처리
//
// 대상: category="사용자 등록" 또는 manufacturer=null 또는 imageUrl=null
//       (이미 enrich 잘 된 product는 skip)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const LIMIT_ARG = args.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1], 10) : 0;

// .env 로드
const env = (() => {
  try {
    return readFileSync(".env", "utf8");
  } catch {
    return "";
  }
})();
function readEnv(name) {
  const m = env.match(new RegExp(`^${name}\\s*=\\s*"?([^"\n\r]+)"?`, "m"));
  return m ? m[1].trim() : process.env[name] ?? null;
}
const FOODSAFETY_KEY =
  readEnv("KOREANNET_API_KEY") ?? readEnv("FOODSAFETY_API_KEY");
const NAVER_ID = readEnv("NAVER_SHOP_CLIENT_ID");
const NAVER_SECRET = readEnv("NAVER_SHOP_CLIENT_SECRET");

if (!FOODSAFETY_KEY && !NAVER_ID) {
  console.error("❌ KOREANNET_API_KEY와 NAVER_SHOP_CLIENT_ID 둘 다 없음 — 적어도 하나 필요");
  process.exit(1);
}
console.log(
  `식약처: ${FOODSAFETY_KEY ? "✓" : "✗"}  네이버: ${NAVER_ID ? "✓" : "✗"}  ${DRY ? "(DRY RUN)" : ""}`,
);

const prisma = new PrismaClient();
const FOODSAFETY_BASE = "http://openapi.foodsafetykorea.go.kr/api";
const NAVER_API = "https://openapi.naver.com/v1/search/shop.json";

// ─── 식약처 lookup ────────────────────────────────────────
async function foodsafetyLookup(barcode) {
  if (!FOODSAFETY_KEY) return null;
  const c005 = await fetch(
    `${FOODSAFETY_BASE}/${FOODSAFETY_KEY}/C005/json/1/1/BAR_CD=${encodeURIComponent(barcode)}`,
  )
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const i2570 = await fetch(
    `${FOODSAFETY_BASE}/${FOODSAFETY_KEY}/I2570/json/1/1/BRCD_NO=${encodeURIComponent(barcode)}`,
  )
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const c = c005?.C005?.row?.[0];
  const i = i2570?.I2570?.row?.[0];
  if (!c && !i) return null;
  return {
    productName: c?.PRDLST_NM || i?.PRDT_NM || "",
    manufacturer: c?.BSSH_NM || i?.CMPNY_NM || "",
    foodType: c?.PRDLST_DCNM,
    shelfLife: c?.POG_DAYCNT,
    manufacturerAddress: c?.SITE_ADDR,
    reportNo: c?.PRDLST_REPORT_NO || i?.PRDLST_REPORT_NO,
    industry: c?.INDUTY_NM,
    category: i
      ? {
          major: i.HTRK_PRDLST_NM,
          mid: i.HRNK_PRDLST_NM,
          minor: i.PRDLST_NM,
        }
      : null,
  };
}

// ─── 네이버 쇼핑 enrich ────────────────────────────────────
function stripHtml(s) {
  return (s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}
function cleanOcrName(rawName) {
  let s = (rawName || "").trim();
  s = s.replace(/^[A-Za-z]{1,2}_+\s*/, "");
  s = s.replace(/_(?:일반|기획|특가|행사|할인|무료배송|증정|set|set\d+)$/gi, "");
  // 괄호 안이 단위·포장 표기일 때만 제거 — "(삼겹살)" 같은 한글 부위는 보존
  s = s.replace(
    /\(\s*\d+(?:\.\d+)?\s*(?:g|kg|ml|l|개입|개|매|입|봉|팩|박스|set)\s*\)/gi,
    " ",
  );
  s = s.replace(/\b\d+(?:\.\d+)?\s*(?:g|kg|ml|l|개입|개|매|입|봉|팩|박스|set)\b/gi, " ");
  s = s.replace(/\b[xX×]\s*\d+\b/g, " ");
  s = s.replace(/_+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || (rawName || "").trim();
}
const MULTIPACK_PATTERNS = [
  /\b[xX×]\s*[2-9]\b/,
  /[2-9]\s*개\s*묶음/,
  /[2-9]\s*개\s*세트/,
  /\b[2-9]\s*세트\b/,
  /\b[2-9]\s*PACK/i,
];
function isMultiPack(title) {
  return MULTIPACK_PATTERNS.some((p) => p.test(title));
}
function tokenOverlap(query, candidate) {
  const qT = (query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (qT.length === 0) return 0;
  const cN = (candidate || "").toLowerCase().replace(/\s+/g, "");
  let hit = 0;
  for (const t of qT) if (cN.includes(t)) hit++;
  return hit / qT.length;
}
async function naverEnrich(rawName, barcode) {
  if (!NAVER_ID || !NAVER_SECRET) return null;
  const cleaned = cleanOcrName(rawName);
  if (cleaned.length < 2) return null;
  const queries = [];
  if (barcode && /^\d{8,14}$/.test(barcode)) queries.push(barcode);
  queries.push(cleaned);
  for (const q of queries) {
    try {
      const url = `${NAVER_API}?query=${encodeURIComponent(q)}&display=30&sort=asc`;
      const res = await fetch(url, {
        headers: {
          "X-Naver-Client-Id": NAVER_ID,
          "X-Naver-Client-Secret": NAVER_SECRET,
        },
      });
      if (!res.ok) continue;
      const json = await res.json();
      const items = (json.items ?? []).map((it) => ({
        title: stripHtml(it.title),
        link: it.link || "",
        image: it.image || "",
        lprice: parseInt((it.lprice || "0").replace(/[^\d]/g, ""), 10) || 0,
        mallName: it.mallName || "기타",
        brand: it.brand || "",
        category: [it.category1, it.category2, it.category3]
          .filter(Boolean)
          .join("/"),
      }));
      if (items.length === 0) continue;
      let best = null;
      for (const it of items) {
        if (isMultiPack(it.title)) continue;
        const score = tokenOverlap(cleaned, it.title);
        if (score < 0.4) continue;
        if (!best || score > best.score) best = { item: it, score };
      }
      if (best) {
        return {
          cleanedQuery: cleaned,
          title: best.item.title || null,
          brand: best.item.brand?.trim() || null,
          category: best.item.category?.trim() || null,
          imageUrl: best.item.image || null,
          productLink: best.item.link || null,
          mallName: best.item.mallName || null,
          matchScore: best.score,
        };
      }
    } catch {
      // continue
    }
  }
  return null;
}

// ─── 메인 처리 ────────────────────────────────────────
const where = {
  OR: [
    { category: "사용자 등록" },
    { manufacturer: null },
    { imageUrl: null },
  ],
};
const candidates = await prisma.product.findMany({
  where,
  select: {
    id: true,
    name: true,
    brand: true,
    barcode: true,
    manufacturer: true,
    category: true,
    imageUrl: true,
    metadata: true,
  },
  ...(LIMIT > 0 ? { take: LIMIT } : {}),
});

console.log(`대상 product: ${candidates.length}개\n`);

let updated = 0;
let unchanged = 0;
let errors = 0;

for (const p of candidates) {
  const cleanName = cleanOcrName(p.name);
  const meta =
    p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
      ? p.metadata
      : {};
  const hasFoodsafety = !!meta.foodsafety;
  const hasNaver = !!meta.naverShop;

  process.stdout.write(`🔎 [${p.barcode ?? "no-bc"}] ${p.name} ... `);
  try {
    let foodsafety = null;
    let naver = null;

    // 1) 식약처 — 바코드 있고 metadata에 없으면 시도
    if (p.barcode && !hasFoodsafety) {
      foodsafety = await foodsafetyLookup(p.barcode);
      await new Promise((r) => setTimeout(r, 120));
    }
    // 2) 네이버 — imageUrl/brand/category 누락이면 시도
    if (!hasNaver && (!p.imageUrl || !p.brand || p.category === "사용자 등록")) {
      naver = await naverEnrich(p.name, p.barcode);
      await new Promise((r) => setTimeout(r, 120));
    }

    // 변경 사항 빌드 — 기존 값 우선, 누락된 것만 채움
    const updates = {};
    const newMeta = { ...meta };

    // 이름은 식약처 우선, 그 다음 네이버 (네이버는 명백히 OCR 잡음일 때만 교체)
    if (foodsafety?.productName?.trim() && foodsafety.productName.trim() !== p.name) {
      updates.name = foodsafety.productName.trim();
    } else if (
      naver?.title?.trim() &&
      cleanName !== p.name &&
      naver.matchScore >= 0.8
    ) {
      // OCR 잡음이 명확하고 네이버 매칭 점수 높을 때만 이름 교체
      updates.name = cleanName;
    } else if (cleanName !== p.name && cleanName.length >= 2) {
      // 잡음 정리만 (네이버 매칭 없어도)
      updates.name = cleanName;
    }

    // brand
    if (!p.brand && naver?.brand) updates.brand = naver.brand;

    // manufacturer
    if (!p.manufacturer && foodsafety?.manufacturer)
      updates.manufacturer = foodsafety.manufacturer;

    // category (사용자 등록 → 더 구체적인 것)
    if (p.category === "사용자 등록") {
      const newCat =
        foodsafety?.category?.minor ||
        foodsafety?.foodType ||
        (naver?.category ? naver.category.split("/").pop()?.trim() : null);
      if (newCat) updates.category = newCat;
    }

    // imageUrl
    if (!p.imageUrl && naver?.imageUrl) updates.imageUrl = naver.imageUrl;

    // metadata
    if (foodsafety) {
      newMeta.foodsafety = {
        productName: foodsafety.productName,
        manufacturer: foodsafety.manufacturer,
        foodType: foodsafety.foodType,
        category: foodsafety.category,
        shelfLife: foodsafety.shelfLife,
        manufacturerAddress: foodsafety.manufacturerAddress,
        reportNo: foodsafety.reportNo,
        industry: foodsafety.industry,
      };
      updates.metadata = newMeta;
    }
    if (naver) {
      newMeta.naverShop = {
        title: naver.title,
        brand: naver.brand,
        category: naver.category,
        imageUrl: naver.imageUrl,
        productLink: naver.productLink,
        mallName: naver.mallName,
        matchScore: naver.matchScore,
      };
      updates.metadata = newMeta;
    }

    if (Object.keys(updates).length === 0) {
      console.log("∅ 변경 없음");
      unchanged++;
      continue;
    }

    if (DRY) {
      const summary = Object.keys(updates)
        .filter((k) => k !== "metadata")
        .map((k) => `${k}=${JSON.stringify(updates[k]).slice(0, 50)}`)
        .join(" ");
      console.log(`✓ (DRY) ${summary}${updates.metadata ? " +meta" : ""}`);
    } else {
      await prisma.product.update({ where: { id: p.id }, data: updates });
      const summary = Object.keys(updates)
        .filter((k) => k !== "metadata")
        .map((k) => `${k}`)
        .join(",");
      console.log(`✅ ${summary}${updates.metadata ? "+meta" : ""}`);
    }
    updated++;
  } catch (e) {
    console.log(`❌ ${e.message}`);
    errors++;
  }
}

console.log("\n=== 결과 ===");
console.log(`업데이트: ${updated}`);
console.log(`변경 없음: ${unchanged}`);
console.log(`오류: ${errors}`);
await prisma.$disconnect();
