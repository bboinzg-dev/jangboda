// 정부 혜택 모듈 시드 — 각 출처에서 혜택을 받아 Benefit 테이블에 upsert
//
// 실행: npm run db:seed:benefits
// 사전 조건: .env에 DATA_GO_KR_SERVICE_KEY, BIZINFO_API_KEY 설정
//
// 멱등 — 같은 (sourceCode, sourceId)는 update. 여러 번 돌려도 안전.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// .env를 process.env로 로드 (tsx는 자동 로드 안 함, 외부 dependency 회피)
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
import type { BenefitRaw } from "../src/lib/benefits/types";
import { fetchGov24 } from "../src/lib/benefits/sources/gov24";
import { fetchMssBiz } from "../src/lib/benefits/sources/mssBiz";
import { fetchMssSupport } from "../src/lib/benefits/sources/mssSupport";
import { fetchBizinfo } from "../src/lib/benefits/sources/bizinfo";

const prisma = new PrismaClient();

async function upsertMany(items: BenefitRaw[]): Promise<number> {
  let n = 0;
  for (const item of items) {
    if (!item.sourceId || !item.title) continue;
    const common = {
      title: item.title,
      summary: item.summary ?? null,
      agency: item.agency ?? null,
      category: item.category ?? null,
      targetType: item.targetType ?? "individual",
      regionCodes: item.regionCodes ?? ["00000"],
      eligibilityRules: item.eligibilityRules ?? {},
      applyUrl: item.applyUrl ?? null,
      detailUrl: item.detailUrl ?? null,
      applyStartAt: item.applyStartAt ?? null,
      applyEndAt: item.applyEndAt ?? null,
      rawData: item.rawData ?? {},
    };
    await prisma.benefit.upsert({
      where: {
        sourceCode_sourceId: {
          sourceCode: item.sourceCode,
          sourceId: item.sourceId,
        },
      },
      create: {
        sourceCode: item.sourceCode,
        sourceId: item.sourceId,
        ...common,
      },
      update: { ...common, lastSyncedAt: new Date() },
    });
    n++;
  }
  return n;
}

async function runOne(
  label: string,
  fn: () => Promise<BenefitRaw[]>,
): Promise<void> {
  process.stdout.write(`[${label}] fetching... `);
  try {
    const items = await fn();
    const n = await upsertMany(items);
    console.log(`받음 ${items.length}건, 저장 ${n}건`);
  } catch (e) {
    console.log(`실패 — ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  console.log("정부 혜택 시드 시작\n");

  await runOne("gov24", () => fetchGov24({ page: 1, perPage: 100 }));
  await runOne("mssBiz", () => fetchMssBiz({ page: 1, perPage: 50 }));
  await runOne("mssSupport", () =>
    fetchMssSupport({ page: 1, perPage: 50 }),
  );
  await runOne("bizinfo", () => fetchBizinfo({ page: 1, perPage: 50 }));

  const total = await prisma.benefit.count();
  console.log(`\n총 ${total}건이 DB에 저장되어 있습니다.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
