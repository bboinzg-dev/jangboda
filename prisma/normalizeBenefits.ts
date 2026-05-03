// Benefit.eligibilityRules의 자유텍스트를 LLM(Gemini Flash)으로 정형화하여
// Benefit.normalizedRules에 저장하는 일괄 스크립트.
// LLM이 applyEndDate/applyStartDate를 추출하면 Benefit.applyEndAt/applyStartAt도
// null일 때만 자동 보강한다.
//
// 실행: npm run db:normalize:benefits
// 사전 조건: .env에 GEMINI_API_KEY 설정
//
// 멱등 — 이미 normalizedRules가 채워진 Benefit은 스킵.
// 한 건 실패해도 전체는 계속 진행.

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

import { PrismaClient, Prisma } from "@prisma/client";
import { normalizeEligibility } from "../src/lib/benefits/llm";

const prisma = new PrismaClient();

// eligibilityRules(Json)에서 LLM에 보낼 4개 필드 추출.
// 출처별 필드명이 다양 — 자주 보이는 키들을 모두 시도.
function extractFreeText(rules: unknown): {
  지원대상?: string;
  선정기준?: string;
  지원내용?: string;
  신청방법?: string;
} {
  if (!rules || typeof rules !== "object") return {};
  const r = rules as Record<string, unknown>;
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  };
  // 행안부/중기부 표준 영문 코드명까지 매핑 — bizinfo/mssSupport는 영문 키로 저장됨
  return {
    지원대상: pick(
      "지원대상",
      "trgetNm", // bizinfo / mssSupport
      "supportTarget",
      "trgterIndvdlArray",
      "target",
    ),
    선정기준: pick(
      "선정기준",
      "refrncNm", // mssSupport (참고/선정 기준)
      "selectionCriteria",
      "slctCritrCn",
      "criteria",
    ),
    지원내용: pick(
      "지원내용",
      "사업개요", // mssBiz enrich가 채운 본문
      "사업내용",
      "sportCn", // bizinfo
      "pldirSportRealmLclasCodeNm", // 분류 (지원 분야)
      "hashtags", // 태그 — 추가 컨텍스트
      "supportContent",
      "content",
    ),
    신청방법: pick(
      "신청방법",
      "reqstMthPapersCn", // mssSupport (신청 방법/서류)
      "reqstBeginEndDe", // 신청 기간 (LLM이 마감일 추출용)
      "applicationMethod",
      "aplyMthdCn",
      "method",
    ),
  };
}

// "YYYY-MM-DD" → Date (잘못된 형식이면 null)
function parseIsoDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("[normalize] GEMINI_API_KEY 미설정 — 종료");
    process.exit(1);
  }

  // normalizedRules가 NULL인 active Benefit만 조회 (멱등)
  const targets = await prisma.benefit.findMany({
    where: {
      active: true,
      normalizedRules: { equals: Prisma.DbNull },
    },
    select: {
      id: true,
      title: true,
      eligibilityRules: true,
      applyStartAt: true,
      applyEndAt: true,
    },
  });

  console.log(`[normalize] 대상 ${targets.length}건`);

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let dateBackfilled = 0; // applyEndAt이 LLM 추출로 보강된 건수

  for (let i = 0; i < targets.length; i++) {
    const b = targets[i];
    const freeText = extractFreeText(b.eligibilityRules);

    // 자유텍스트가 비어있으면 스킵 (LLM 호출 무의미)
    if (!freeText.지원대상 && !freeText.선정기준 && !freeText.지원내용) {
      skipped++;
      continue;
    }

    try {
      const normalized = await normalizeEligibility(freeText);

      // applyEndAt/applyStartAt이 null이면 LLM 추출 값으로 보강
      const updateData: Prisma.BenefitUpdateInput = {
        normalizedRules: normalized as unknown as Prisma.InputJsonValue,
      };
      if (!b.applyEndAt) {
        const extracted = parseIsoDate(normalized.applyEndDate);
        if (extracted) {
          updateData.applyEndAt = extracted;
          dateBackfilled++;
        }
      }
      if (!b.applyStartAt) {
        const extracted = parseIsoDate(normalized.applyStartDate);
        if (extracted) updateData.applyStartAt = extracted;
      }

      await prisma.benefit.update({
        where: { id: b.id },
        data: updateData,
      });
      success++;
    } catch (e) {
      failed++;
      console.error(
        `[normalize] 실패 id=${b.id} title="${b.title.slice(0, 30)}":`,
        (e as Error).message,
      );
    }

    // 진행률 — 50건마다 출력
    if ((i + 1) % 50 === 0) {
      console.log(
        `[normalize] 진행 ${i + 1}/${targets.length} (성공 ${success} / 실패 ${failed} / 스킵 ${skipped} / 마감일보강 ${dateBackfilled})`,
      );
    }

    // rate limit 방지 — 5건마다 1초 대기 (Gemini Flash 분당 1000 RPM 한도 고려)
    if ((i + 1) % 5 === 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log(
    `[normalize] 완료 — 총 ${targets.length}건 / 성공 ${success} / 실패 ${failed} / 스킵 ${skipped} / 마감일보강 ${dateBackfilled}`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[normalize] 치명적 오류:", e);
  await prisma.$disconnect();
  process.exit(1);
});
