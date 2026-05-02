// 기존 Benefit 레코드의 regionCodes 백필(backfill)
//
// 실행: npm run db:backfill:regions
//
// 로직:
// - regionCodes가 정확히 ["00000"]인 레코드만 대상 (멱등 — 이미 시도 코드가
//   채워진 항목은 skip)
// - agency에서 regionFromAgency()가 시도 코드를 뽑아내면 그 값으로 update
// - 아무 매칭도 안 되면 그대로 둠

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
  let skippedNotNationwide = 0;
  let skippedNoMatch = 0;

  for (const b of all) {
    scanned++;

    // 멱등: 이미 ["00000"] 외 값을 가진 항목은 건드리지 않음
    const isExactlyNationwide =
      b.regionCodes.length === 1 && b.regionCodes[0] === "00000";
    if (!isExactlyNationwide) {
      skippedNotNationwide++;
    } else {
      const inferred = regionFromAgency(b.agency);
      if (inferred && inferred.length > 0) {
        await prisma.benefit.update({
          where: { id: b.id },
          data: { regionCodes: inferred },
        });
        updated++;
      } else {
        skippedNoMatch++;
      }
    }

    if (scanned % 100 === 0) {
      console.log(
        `진행 ${scanned}/${all.length} — 업데이트 ${updated} / 시도코드 이미 있음 ${skippedNotNationwide} / 매칭 실패 ${skippedNoMatch}`,
      );
    }
  }

  console.log(
    `\n완료: 전체 ${scanned}건 스캔, ${updated}건 업데이트, ` +
      `${skippedNotNationwide}건 이미 시도 코드 있음(skip), ${skippedNoMatch}건 agency 매칭 실패(전국 유지)`,
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
