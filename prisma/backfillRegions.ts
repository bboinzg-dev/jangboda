// 기존 Benefit 레코드의 regionCodes 백필(backfill)
//
// 실행: npm run db:backfill:regions
//
// 로직:
// - 모든 항목에 대해 regionFromAgency() 결과와 현재 regionCodes 비교
// - 다르면 update (멱등 — 동일하면 skip)
// - regionFromAgency가 null이면 그대로 둠
// - 시·군·구 정밀화도 재실행 가능 ("11000" → "11545" 같은 case)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// .env를 process.env로 로드 (seedBenefits.ts와 동일 패턴)
function loadEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, raw] = m;
      const v = raw.replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* .env 없으면 무시 */
  }
}
loadEnv();

import { PrismaClient } from "@prisma/client";
import { regionFromAgency } from "../src/lib/benefits/regions";

const prisma = new PrismaClient();

async function main() {
  console.log("regionCodes 백필 시작\n");

  // 모든 Benefit 가져오기 — 필요한 필드만
  const all = await prisma.benefit.findMany({
    select: {
      id: true,
      sourceCode: true,
      agency: true,
      regionCodes: true,
    },
  });
  console.log(`전체 ${all.length}건 조회`);

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let noMatch = 0;
  let sigunguPrecised = 0; // 기존 시·도 코드("11000")가 시·군·구 코드("11545")로 정밀화된 건수

  for (const b of all) {
    scanned++;

    const inferred = regionFromAgency(b.agency);
    if (!inferred || inferred.length === 0) {
      noMatch++;
      continue;
    }

    // 정렬 후 직렬화 비교 (멱등)
    const cur = [...b.regionCodes].sort().join(",");
    const next = [...inferred].sort().join(",");
    if (cur === next) {
      unchanged++;
      continue;
    }

    // 시·군·구 정밀화 카운트 ("11000" → "11545" 같은 케이스)
    if (
      b.regionCodes.length === 1 &&
      b.regionCodes[0].endsWith("000") &&
      inferred.length === 1 &&
      !inferred[0].endsWith("000") &&
      b.regionCodes[0].slice(0, 2) === inferred[0].slice(0, 2)
    ) {
      sigunguPrecised++;
    }

    await prisma.benefit.update({
      where: { id: b.id },
      data: { regionCodes: inferred },
    });
    updated++;

    if (scanned % 200 === 0) {
      console.log(
        `진행 ${scanned}/${all.length} — 업데이트 ${updated} (시군구 정밀화 ${sigunguPrecised}) / 동일 ${unchanged} / 매칭 실패 ${noMatch}`,
      );
    }
  }

  console.log(
    `\n완료: 전체 ${scanned}건 스캔, ${updated}건 업데이트 ` +
      `(그 중 시·군·구 정밀화 ${sigunguPrecised}건), ` +
      `${unchanged}건 변화 없음, ${noMatch}건 agency 매칭 실패`,
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
