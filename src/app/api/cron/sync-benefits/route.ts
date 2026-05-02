// 정부 혜택 일일 자동 동기화
// 매일 새벽 cron이 4개 출처의 첫 페이지를 가져와 신규 공고를 catch-up.
// 전체 페이지네이션은 prisma/seedBenefits.ts (수동 실행)에서 담당.
//
// 인증: Authorization: Bearer ${CRON_SECRET}
// 수동 호출: curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/sync-benefits
import { NextResponse, type NextRequest } from "next/server";
import { Prisma, PrismaClient } from "@prisma/client";
import { fetchGov24 } from "@/lib/benefits/sources/gov24";
import { fetchMssBiz } from "@/lib/benefits/sources/mssBiz";
import { fetchMssSupport } from "@/lib/benefits/sources/mssSupport";
import { fetchBizinfo } from "@/lib/benefits/sources/bizinfo";
import type { BenefitRaw } from "@/lib/benefits/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const prisma = new PrismaClient();

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 개발/로컬 모드
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function upsertMany(items: BenefitRaw[]) {
  let created = 0;
  let updated = 0;
  for (const item of items) {
    if (!item.sourceId || !item.title) continue;
    const common = {
      title: item.title,
      summary: item.summary ?? null,
      agency: item.agency ?? null,
      category: item.category ?? null,
      targetType: item.targetType ?? "individual",
      regionCodes: item.regionCodes ?? ["00000"],
      eligibilityRules: (item.eligibilityRules ?? {}) as Prisma.InputJsonValue,
      applyUrl: item.applyUrl ?? null,
      detailUrl: item.detailUrl ?? null,
      applyStartAt: item.applyStartAt ?? null,
      applyEndAt: item.applyEndAt ?? null,
      rawData: (item.rawData ?? {}) as Prisma.InputJsonValue,
    };
    // findUnique + create/update — upsert는 트랜잭션 비용 큼
    const existing = await prisma.benefit.findUnique({
      where: {
        sourceCode_sourceId: {
          sourceCode: item.sourceCode,
          sourceId: item.sourceId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.benefit.update({
        where: { id: existing.id },
        data: { ...common, lastSyncedAt: new Date() },
      });
      updated++;
    } else {
      await prisma.benefit.create({
        data: { sourceCode: item.sourceCode, sourceId: item.sourceId, ...common },
      });
      created++;
    }
  }
  return { created, updated };
}

type SourceResult = {
  source: string;
  ok: boolean;
  fetched?: number;
  created?: number;
  updated?: number;
  error?: string;
};

async function runOne(
  source: string,
  fn: () => Promise<BenefitRaw[]>,
): Promise<SourceResult> {
  try {
    const items = await fn();
    const stats = await upsertMany(items);
    return { source, ok: true, fetched: items.length, ...stats };
  } catch (e) {
    return {
      source,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function handler(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  // 4개 출처 병렬 — 각각 page 1만 (60초 안에 끝나야)
  const results = await Promise.all([
    runOne("gov24", () => fetchGov24({ page: 1, perPage: 100 })),
    runOne("mssBiz", () => fetchMssBiz({ page: 1, perPage: 100 })),
    runOne("mssSupport", () => fetchMssSupport({ page: 1, perPage: 100 })),
    runOne("bizinfo", () => fetchBizinfo({ page: 1, perPage: 100 })),
  ]);

  const totalCreated = results.reduce((s, r) => s + (r.created ?? 0), 0);
  const totalUpdated = results.reduce((s, r) => s + (r.updated ?? 0), 0);

  return NextResponse.json({
    elapsedMs: Date.now() - start,
    totalCreated,
    totalUpdated,
    results,
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
