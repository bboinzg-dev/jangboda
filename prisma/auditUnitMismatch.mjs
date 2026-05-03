// 단위(unit) mismatch로 잘못 매칭된 가격을 감사 + 정리
//
// 시나리오:
//   - Product "양배추 1통(1.5~2kg)" 에 "양배추 15kg 박스 16,000원"이 가격으로 잡힘
//   - Product 기준 단위에 비해 단가가 비현실적으로 작거나(박스), 매우 큰(파편) 가격을 wipe
//
// 로직:
//   1. 가격 1건 이상 있는 모든 Product 로드
//   2. 각 product의 가격 → 단가(원/단위) 산출
//   3. 단가가 3건 이상 있는 product에 대해 median 계산
//   4. 단가 < median × 0.3  또는  단가 > median × 3 인 가격을 wipe 후보로
//   5. source IN ("naver","parsa","seed","manual","receipt") 만 wipe (kamis, stats_official 보존)
//
// 실행: node prisma/auditUnitMismatch.mjs [--apply]
//   기본은 dry-run (audit만), --apply 붙이면 실제 삭제

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ──────────────────────────────────────────────────────────────
// units.ts 의 unitPriceValue 로직 inline 복사 (mjs에서 ts import 제약)
// ──────────────────────────────────────────────────────────────
const G_PATTERN = /(\d+(?:\.\d+)?)\s*(?:g|그램)/i;
const KG_PATTERN = /(\d+(?:\.\d+)?)\s*kg/i;
const ML_PATTERN = /(\d+(?:\.\d+)?)\s*ml/i;
const L_PATTERN = /(\d+(?:\.\d+)?)\s*[lL](?![a-z])/;
const COUNT_PATTERN = /(\d+)\s*(?:개|입|개입|구|봉|병|캔|팩)/;
const MULTIPLIER_PATTERN = /(\d+)\s*(?:개입|개|입|봉|병|캔|팩)/;

function extractWeight(unit) {
  const kg = unit.match(KG_PATTERN);
  if (kg) return parseFloat(kg[1]) * 1000;
  const g = unit.match(G_PATTERN);
  if (g) return parseFloat(g[1]);
  return null;
}

function extractVolume(unit) {
  const ml = unit.match(ML_PATTERN);
  if (ml) return parseFloat(ml[1]);
  const l = unit.match(L_PATTERN);
  if (l) return parseFloat(l[1]) * 1000;
  return null;
}

function extractMultiplier(unit) {
  const m = unit.match(/[x×]\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const single = unit.match(MULTIPLIER_PATTERN);
  if (single) return parseInt(single[1], 10);
  return 1;
}

function parseUnit(unit) {
  if (!unit) return null;
  const cleaned = unit.replace(/\s+/g, " ").trim();

  const multiplier = extractMultiplier(cleaned);
  const weight = extractWeight(cleaned);
  if (weight !== null) {
    const total = weight * multiplier;
    if (total < 100) return { value: total, basisDenominator: 1 };
    return { value: total, basisDenominator: 100 };
  }

  const volume = extractVolume(cleaned);
  if (volume !== null) {
    const total = volume * multiplier;
    if (total < 100) return { value: total, basisDenominator: 1 };
    return { value: total, basisDenominator: 1000 };
  }

  const count = cleaned.match(COUNT_PATTERN);
  if (count) {
    return { value: parseInt(count[1], 10), basisDenominator: 1 };
  }

  return null;
}

function unitPriceValue(price, unit) {
  const q = parseUnit(unit);
  if (!q || q.value <= 0) return null;
  return (price * q.basisDenominator) / q.value;
}

// ──────────────────────────────────────────────────────────────
// 통계: median
// ──────────────────────────────────────────────────────────────
function median(arr) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ──────────────────────────────────────────────────────────────
// 본 작업
// ──────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--apply");
const WIPABLE_SOURCES = new Set(["naver", "parsa", "seed", "manual", "receipt"]);
const LOWER_RATIO = 0.3;
const UPPER_RATIO = 3.0;
const MIN_SAMPLES = 3; // median 계산을 위한 최소 가격 건수

async function main() {
  console.log("=".repeat(70));
  console.log(`단위 mismatch 가격 감사 (${APPLY ? "APPLY 모드 - 실제 삭제" : "DRY-RUN 모드"})`);
  console.log("=".repeat(70));
  console.log(`기준: median × ${LOWER_RATIO} 미만 또는 median × ${UPPER_RATIO} 초과`);
  console.log(`wipable sources: ${[...WIPABLE_SOURCES].join(", ")}`);
  console.log(`보존 sources: kamis, stats_official, 그 외`);
  console.log("");

  // 가격 1건 이상인 모든 Product
  const products = await prisma.product.findMany({
    where: { prices: { some: {} } },
    select: {
      id: true,
      name: true,
      unit: true,
      category: true,
      prices: {
        select: {
          id: true,
          price: true,
          source: true,
          store: { select: { name: true } },
        },
      },
    },
  });

  console.log(`총 Product: ${products.length}건`);

  let analyzableCount = 0;
  let totalWipeCandidates = 0;
  const productSummaries = []; // top 5 보고용

  // 모든 wipe 후보 priceId 모음
  const wipeIds = [];

  for (const p of products) {
    // 단가 산출
    const priceWithUnit = p.prices
      .map((pr) => {
        const upv = unitPriceValue(pr.price, p.unit);
        return upv != null ? { ...pr, unitPrice: upv } : null;
      })
      .filter(Boolean);

    if (priceWithUnit.length < MIN_SAMPLES) continue;
    analyzableCount++;

    const med = median(priceWithUnit.map((x) => x.unitPrice));
    if (!med || med <= 0) continue;

    const lower = med * LOWER_RATIO;
    const upper = med * UPPER_RATIO;

    const outliers = priceWithUnit.filter(
      (x) =>
        (x.unitPrice < lower || x.unitPrice > upper) &&
        WIPABLE_SOURCES.has(x.source)
    );

    if (outliers.length === 0) continue;

    totalWipeCandidates += outliers.length;
    productSummaries.push({
      productId: p.id,
      name: p.name,
      unit: p.unit,
      category: p.category,
      median: med,
      sampleCount: priceWithUnit.length,
      outliers,
    });

    for (const o of outliers) wipeIds.push(o.id);
  }

  // 카테고리별 그룹핑 출력
  const byCategory = {};
  for (const ps of productSummaries) {
    if (!byCategory[ps.category]) byCategory[ps.category] = [];
    byCategory[ps.category].push(ps);
  }

  console.log(`\n단가 계산 가능한 Product (≥${MIN_SAMPLES}건): ${analyzableCount}건`);
  console.log(`이상치 발생 Product: ${productSummaries.length}건`);
  console.log(`총 wipe 후보 가격: ${totalWipeCandidates}건\n`);

  console.log("─".repeat(70));
  console.log("카테고리별 wipe 후보");
  console.log("─".repeat(70));

  for (const [cat, list] of Object.entries(byCategory).sort(
    (a, b) => b[1].length - a[1].length
  )) {
    console.log(`\n[${cat}] product ${list.length}건`);
    for (const ps of list.slice(0, 20)) {
      console.log(
        `  • ${ps.name}  (단위: ${ps.unit}, n=${ps.sampleCount}, median=${Math.round(
          ps.median
        ).toLocaleString("ko-KR")}원/단위)`
      );
      for (const o of ps.outliers.slice(0, 8)) {
        const ratio = (o.unitPrice / ps.median).toFixed(2);
        const tag = o.unitPrice < ps.median * LOWER_RATIO ? "↓싸게" : "↑비싸게";
        console.log(
          `      - ${tag} ${o.price.toLocaleString("ko-KR")}원 (단가 ${Math.round(
            o.unitPrice
          ).toLocaleString("ko-KR")}, ×${ratio}, ${o.store?.name ?? "?"} / ${o.source})`
        );
      }
      if (ps.outliers.length > 8) {
        console.log(`      ... 외 ${ps.outliers.length - 8}건`);
      }
    }
    if (list.length > 20) {
      console.log(`  ... 외 product ${list.length - 20}건`);
    }
  }

  // top 5 by wipe count
  console.log("\n" + "─".repeat(70));
  console.log("top 5 (wipe 가격 많은 product)");
  console.log("─".repeat(70));
  const top5 = [...productSummaries]
    .sort((a, b) => b.outliers.length - a.outliers.length)
    .slice(0, 5);
  for (const ps of top5) {
    console.log(
      `  ${ps.outliers.length}건  ${ps.name} (단위: ${ps.unit}, median ${Math.round(
        ps.median
      ).toLocaleString("ko-KR")}원/단위)`
    );
  }

  console.log("\n" + "=".repeat(70));
  if (APPLY) {
    if (wipeIds.length === 0) {
      console.log("삭제할 가격 없음.");
    } else {
      const result = await prisma.price.deleteMany({
        where: { id: { in: wipeIds } },
      });
      console.log(`삭제 완료: ${result.count}건`);
    }
  } else {
    console.log(`DRY-RUN: ${wipeIds.length}건이 wipe 대상입니다.`);
    console.log(`실제 삭제하려면: node prisma/auditUnitMismatch.mjs --apply`);
  }
  console.log("=".repeat(70));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
