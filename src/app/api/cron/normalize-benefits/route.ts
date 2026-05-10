// 정부 혜택 정형화 자동 cron — 매일 새벽 4시 (sync 1시간 뒤)
// normalizedRules가 비어있는 active Benefit 중 최대 30건을 LLM으로 정형화.
// (60초 timeout 대비 30건 제한 — 평균 호출 1.5초 × 30 = 45초)
//
// 인증: Authorization: Bearer ${CRON_SECRET}
// 수동 호출: curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/normalize-benefits
//
// 멱등 — 같은 항목이 두 번 처리되지 않음.
import { NextResponse, type NextRequest } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeEligibility } from "@/lib/benefits/llm";
import { isCronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

const prisma = new PrismaClient();

function parseIsoDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// eligibilityRules(Json)에서 LLM에 보낼 4개 필드 추출
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
  // 행안부/중기부 표준 영문 코드명까지 매핑 (bizinfo/mssSupport용)
  return {
    지원대상: pick("지원대상", "trgetNm", "supportTarget", "trgterIndvdlArray", "target"),
    선정기준: pick("선정기준", "refrncNm", "selectionCriteria", "slctCritrCn", "criteria"),
    지원내용: pick("지원내용", "사업개요", "사업내용", "sportCn", "pldirSportRealmLclasCodeNm", "hashtags", "supportContent", "content"),
    신청방법: pick("신청방법", "reqstMthPapersCn", "reqstBeginEndDe", "applicationMethod", "aplyMthdCn", "method"),
  };
}

async function handler(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not set" },
      { status: 500 },
    );
  }

  const start = Date.now();

  // 정형화 안 된 active Benefit 최대 30건
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
    take: 30,
  });

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let dateBackfilled = 0;

  for (const b of targets) {
    const ft = extractFreeText(b.eligibilityRules);
    if (!ft.지원대상 && !ft.선정기준 && !ft.지원내용) {
      skipped++;
      continue;
    }

    try {
      const normalized = await normalizeEligibility(ft);

      const updateData: Prisma.BenefitUpdateInput = {
        normalizedRules: normalized as unknown as Prisma.InputJsonValue,
      };
      if (!b.applyEndAt) {
        const d = parseIsoDate(normalized.applyEndDate);
        if (d) {
          updateData.applyEndAt = d;
          dateBackfilled++;
        }
      }
      if (!b.applyStartAt) {
        const d = parseIsoDate(normalized.applyStartDate);
        if (d) updateData.applyStartAt = d;
      }

      await prisma.benefit.update({
        where: { id: b.id },
        data: updateData,
      });
      success++;
    } catch (e) {
      failed++;
      console.error(
        `[normalize-cron] 실패 id=${b.id} title="${b.title.slice(0, 30)}":`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  return NextResponse.json({
    elapsedMs: Date.now() - start,
    targets: targets.length,
    success,
    failed,
    skipped,
    dateBackfilled,
    note:
      targets.length === 30
        ? "30건 한도 도달 — 다음 cron 또는 수동 실행 시 이어서 처리됨"
        : "모든 미처리 항목 완료",
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}
export async function POST(req: NextRequest) {
  return handler(req);
}
