// 기존 DB의 SKU 불일치 가격 검출·정리
//
// 검출 로직:
//   1) product 단위로 가격을 모음
//   2) "기준 가격" 모음 = source ∈ {seed, manual, receipt, kamis, parsa} (사용자/공공)
//      이 모음의 단가(원/100g 등) 중앙값 = baseline
//   3) source=naver(자동 sync) 가격 중 단가가 baseline 대비
//      < 0.5배 또는 > 2배 → SKU mismatch 가능성 높음
//   4) baseline이 없으면 (자동 sync 가격만 있는 product) skip
//
// 사용:
//   node prisma/purgeSkuMismatch.mjs --dry           # 미리보기만
//   node prisma/purgeSkuMismatch.mjs                 # 삭제
//   node prisma/purgeSkuMismatch.mjs --threshold=0.6 # 임계값 변경 (default 0.5)
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const THRESHOLD_ARG = args.find((a) => a.startsWith("--threshold="));
const LOW_RATIO = THRESHOLD_ARG
  ? parseFloat(THRESHOLD_ARG.split("=")[1])
  : 0.5;
const HIGH_RATIO = 1 / LOW_RATIO;

const prisma = new PrismaClient();

// units.ts의 parseUnit과 동일 로직 — 단가 계산용
const G_PATTERN = /(\d+(?:\.\d+)?)\s*(?:g|그램)/i;
const KG_PATTERN = /(\d+(?:\.\d+)?)\s*kg/i;
const ML_PATTERN = /(\d+(?:\.\d+)?)\s*ml/i;
const L_PATTERN = /(\d+(?:\.\d+)?)\s*[lL](?![a-z])/;
const COUNT_PATTERN = /(\d+)\s*(?:개|입|개입|구|봉|병|캔|팩|매|롤|장|EA|ea|포기|통|송이|마리|단|박스|박|자루|봉지|줄|쪽|모|판|상자|박스)/;
const MULTIPLIER_PATTERN = /(\d+)\s*(?:개입|개|입|봉|병|캔|팩|매|롤|장|EA|ea|포기|통|송이|마리|단|박스|박|자루|봉지|줄|쪽|모|판|상자)/;

function parseUnit(unit) {
  if (!unit) return null;
  const cleaned = unit.replace(/\s+/g, " ").trim();
  const xMatch = cleaned.match(/[x×]\s*(\d+)/i);
  const multiplier = xMatch
    ? parseInt(xMatch[1], 10)
    : (cleaned.match(MULTIPLIER_PATTERN)
      ? parseInt(cleaned.match(MULTIPLIER_PATTERN)[1], 10)
      : 1);
  const kg = cleaned.match(KG_PATTERN);
  if (kg) {
    const total = parseFloat(kg[1]) * 1000 * multiplier;
    return { value: total, unit: "g", denom: total < 100 ? 1 : 100 };
  }
  const g = cleaned.match(G_PATTERN);
  if (g) {
    const total = parseFloat(g[1]) * multiplier;
    return { value: total, unit: "g", denom: total < 100 ? 1 : 100 };
  }
  const l = cleaned.match(L_PATTERN);
  if (l) {
    const total = parseFloat(l[1]) * 1000 * multiplier;
    return { value: total, unit: "ml", denom: total < 100 ? 1 : 1000 };
  }
  const ml = cleaned.match(ML_PATTERN);
  if (ml) {
    const total = parseFloat(ml[1]) * multiplier;
    return { value: total, unit: "ml", denom: total < 100 ? 1 : 1000 };
  }
  const c = cleaned.match(COUNT_PATTERN);
  if (c) return { value: parseInt(c[1], 10), unit: "count", denom: 1 };
  return null;
}

function unitPriceValue(price, unit) {
  const q = parseUnit(unit);
  if (!q || q.value <= 0) return null;
  return (price * q.denom) / q.value;
}

function median(arr) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const TRUSTED = new Set(["seed", "manual", "receipt", "kamis", "parsa", "stats_official", "csv"]);
const TARGET = new Set(["naver"]);

// product별 가격 모두 가져옴 — unit이 파싱되는 product만 의미 있음
const products = await prisma.product.findMany({
  select: {
    id: true,
    name: true,
    unit: true,
    prices: {
      select: {
        id: true,
        listPrice: true,
        source: true,
        store: { select: { name: true, chain: { select: { name: true } } } },
      },
    },
  },
});

console.log(
  `검사 대상: ${products.length} product, 임계값: ×${LOW_RATIO} ~ ×${HIGH_RATIO.toFixed(2)} ${DRY ? "(DRY RUN)" : ""}`,
);
console.log();

let scanned = 0;
let suspectCount = 0;
let removed = 0;
const samples = [];

for (const p of products) {
  if (!parseUnit(p.unit)) continue;
  if (p.prices.length < 2) continue; // baseline 부족
  scanned++;
  const trustedUP = p.prices
    .filter((pr) => TRUSTED.has(pr.source))
    .map((pr) => unitPriceValue(pr.listPrice, p.unit))
    .filter((v) => v !== null && v > 0);
  if (trustedUP.length === 0) continue; // 신뢰 baseline 없음 — naver만 있는 product는 비교 불가, skip
  const baseline = median(trustedUP);
  if (!baseline) continue;
  const lowBound = baseline * LOW_RATIO;
  const highBound = baseline * HIGH_RATIO;

  for (const pr of p.prices) {
    if (!TARGET.has(pr.source)) continue;
    const up = unitPriceValue(pr.listPrice, p.unit);
    if (up === null) continue;
    if (up < lowBound || up > highBound) {
      suspectCount++;
      samples.push({
        product: p.name,
        unit: p.unit,
        chainName: pr.store?.chain?.name ?? "?",
        price: pr.listPrice,
        unitPrice: Math.round(up),
        baseline: Math.round(baseline),
        ratio: (up / baseline).toFixed(2),
        priceId: pr.id,
      });
      if (!DRY) {
        await prisma.price.delete({ where: { id: pr.id } });
        removed++;
      }
    }
  }
}

console.log(`scanned product: ${scanned}`);
console.log(`SKU mismatch 의심 가격: ${suspectCount}건`);
console.log(`${DRY ? "DRY (삭제 안 함)" : `삭제: ${removed}건`}`);
console.log("\n샘플 (최대 30건):");
for (const s of samples.slice(0, 30)) {
  console.log(
    `  [${s.chainName}] ${s.product} (${s.unit}) | ${s.price}원 (단가 ${s.unitPrice}) | baseline ${s.baseline} | ×${s.ratio}`,
  );
}
if (samples.length > 30) {
  console.log(`  ... 외 ${samples.length - 30}건`);
}

await prisma.$disconnect();
