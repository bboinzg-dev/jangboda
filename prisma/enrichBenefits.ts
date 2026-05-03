// MSS/BIZINFO 본문 보강 일괄 스크립트
// bizinfo / mssBiz / mssSupport는 list API에 메타만 있어 자유텍스트가 비어있음.
// detailUrl을 fetch해서 본문(지원대상/선정기준/지원내용/신청방법 등)을 추출,
// Benefit.eligibilityRules에 저장한다. 그러면 다음 normalize batch가
// LLM 정형화를 정상적으로 수행할 수 있다.
//
// 실행: npm run db:enrich:benefits
// 멱등 — 동일 항목 다시 실행해도 enrich.ts가 기존 키 보존.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

import { PrismaClient, Prisma } from "@prisma/client";
import {
  enrichBenefit,
  sleep,
} from "../src/lib/benefits/sources/enrich";
import type { BenefitRaw, SourceCode } from "../src/lib/benefits/types";

const prisma = new PrismaClient();

async function main() {
  // 본문 보강 대상 출처들
  const targets = await prisma.benefit.findMany({
    where: {
      active: true,
      sourceCode: { in: ["BIZINFO", "MSS_BIZ", "MSS_SUPPORT"] },
    },
    select: {
      id: true,
      sourceCode: true,
      sourceId: true,
      title: true,
      summary: true,
      agency: true,
      category: true,
      targetType: true,
      regionCodes: true,
      eligibilityRules: true,
      applyUrl: true,
      detailUrl: true,
      applyStartAt: true,
      applyEndAt: true,
    },
  });

  console.log(`[enrich] 대상 ${targets.length}건`);

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const b = targets[i];
    const raw: BenefitRaw = {
      sourceCode: b.sourceCode as SourceCode,
      sourceId: b.sourceId,
      title: b.title,
      summary: b.summary ?? undefined,
      agency: b.agency ?? undefined,
      category: b.category ?? undefined,
      targetType: (b.targetType as BenefitRaw["targetType"]) ?? undefined,
      regionCodes: b.regionCodes,
      eligibilityRules: (b.eligibilityRules ?? {}) as Record<string, unknown>,
      applyUrl: b.applyUrl ?? undefined,
      detailUrl: b.detailUrl ?? undefined,
      applyStartAt: b.applyStartAt ?? undefined,
      applyEndAt: b.applyEndAt ?? undefined,
    };

    try {
      const enriched = await enrichBenefit(raw);
      const before = JSON.stringify(raw.eligibilityRules ?? {});
      const after = JSON.stringify(enriched.eligibilityRules ?? {});
      if (before === after) {
        unchanged++;
      } else {
        await prisma.benefit.update({
          where: { id: b.id },
          data: {
            eligibilityRules:
              enriched.eligibilityRules as Prisma.InputJsonValue,
          },
        });
        updated++;
      }
    } catch (e) {
      failed++;
      console.error(
        `[enrich] 실패 id=${b.id} title="${b.title.slice(0, 30)}":`,
        e instanceof Error ? e.message : e,
      );
    }

    if ((i + 1) % 50 === 0) {
      console.log(
        `[enrich] 진행 ${i + 1}/${targets.length} (보강 ${updated} / 변화없음 ${unchanged} / 실패 ${failed})`,
      );
    }

    // rate limit 회피
    await sleep(300);
  }

  console.log(
    `[enrich] 완료 — 총 ${targets.length} / 보강 ${updated} / 변화없음 ${unchanged} / 실패 ${failed}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[enrich] 치명적 오류:", e);
  await prisma.$disconnect();
  process.exit(1);
});
