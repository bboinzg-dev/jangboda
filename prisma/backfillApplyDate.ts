// normalizedRules.applyEndDate / applyStartDate가 채워졌지만
// Benefit.applyEndAt / applyStartAt은 여전히 null인 항목을 일괄 보강.
// (첫 normalize batch 시점에는 보강 로직이 없어서 누락된 것들)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
function loadEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const v = m[2].replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {}
}
loadEnv();

import { PrismaClient, Prisma } from "@prisma/client";
const p = new PrismaClient();

function parseIsoDate(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  // normalizedRules가 NULL이 아닌 모든 active Benefit
  const items = await p.benefit.findMany({
    where: {
      active: true,
      NOT: { normalizedRules: { equals: Prisma.DbNull } },
    },
    select: {
      id: true,
      title: true,
      applyStartAt: true,
      applyEndAt: true,
      normalizedRules: true,
    },
  });

  console.log(`[backfill-date] 후보 ${items.length}건`);

  let endBackfilled = 0;
  let startBackfilled = 0;
  let bothMissing = 0;
  let alreadyHave = 0;

  for (const item of items) {
    const norm = item.normalizedRules as Record<string, unknown> | null;
    if (!norm) continue;

    const updateData: Prisma.BenefitUpdateInput = {};

    if (!item.applyEndAt) {
      const d = parseIsoDate(norm.applyEndDate);
      if (d) {
        updateData.applyEndAt = d;
        endBackfilled++;
      } else {
        bothMissing++;
      }
    } else {
      alreadyHave++;
    }

    if (!item.applyStartAt) {
      const d = parseIsoDate(norm.applyStartDate);
      if (d) {
        updateData.applyStartAt = d;
        startBackfilled++;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await p.benefit.update({ where: { id: item.id }, data: updateData });
    }

    if ((endBackfilled + startBackfilled) % 100 === 0 && endBackfilled + startBackfilled > 0) {
      console.log(
        `  진행 — applyEndAt 보강 ${endBackfilled} / applyStartAt 보강 ${startBackfilled}`,
      );
    }
  }

  console.log(
    `[backfill-date] 완료 — applyEndAt 보강 ${endBackfilled} / applyStartAt 보강 ${startBackfilled} / 이미 있음 ${alreadyHave} / LLM도 추출 못함 ${bothMissing}`,
  );
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
