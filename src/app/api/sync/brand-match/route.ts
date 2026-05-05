// Brand 사전 매칭 일괄 적용 (한국 인기 식품 brand 사전 → product.brand/manufacturer/origin)
//
// 목적:
//   한국소비자원 참가격(parsa) raw API는 brand/manufacturer를 안 줌.
//   식약처 enrich도 매칭률 0.3%로 낮음.
//   → product name의 trademark keyword(햇반, 신라면, 비비고 등)로 brand·manufacturer 자동 채움
//
// Cron: 매주 일요일 02시 — parsa enrich(토 23시) 다음 (식약처 enrich가 못 채운 것을 보완)
// 인증: Authorization: Bearer ${CRON_SECRET}
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import { matchBrand, generateAliasCandidates } from "@/lib/brandRules";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 50_000;
  try {
    // category가 "참가격 등록 상품"이거나 비어있는 product는 brand 매칭 시 category도 갱신
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { brand: null },
          { manufacturer: null },
          { origin: null },
          { category: "참가격 등록 상품" },
          { category: "사용자 등록" },
        ],
      },
      select: { id: true, name: true, brand: true, manufacturer: true, origin: true, category: true },
    });
    let updated = 0;
    let processed = 0;
    let categoriesUpdated = 0;
    const byBrand = new Map<string, number>();

    // 카테고리가 일반 라벨(참가격 등록 상품 / 사용자 등록)일 때만 정상화 — 명시적 카테고리는 보존
    const isGenericCategory = (c: string) =>
      c === "참가격 등록 상품" || c === "사용자 등록";

    for (const p of products) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      processed++;
      const m = matchBrand(p.name);
      if (!m) continue;
      const data: { brand?: string; manufacturer?: string; origin?: string; category?: string } = {};
      if (!p.brand) data.brand = m.brand;
      if (!p.manufacturer) data.manufacturer = m.manufacturer;
      if (!p.origin && m.origin) data.origin = m.origin;
      if (m.category && isGenericCategory(p.category)) {
        data.category = m.category;
        categoriesUpdated++;
      }
      if (Object.keys(data).length === 0) continue;
      try {
        await prisma.product.update({ where: { id: p.id }, data });
        updated++;
        byBrand.set(m.brand, (byBrand.get(m.brand) ?? 0) + 1);
      } catch {
        // 개별 실패는 무시 (다음 product 진행)
      }
    }

    // 시간 budget 남으면 alias 자동 생성 진행
    // 영수증 OCR 매칭용 — "CJ 햇반 백미밥" 외에 "햇반 백미밥", "햇반"도 alias로 등록.
    // ProductAlias.alias는 @@unique 제약 — 충돌 시 silent skip.
    let aliasesCreated = 0;
    if (Date.now() - startedAt < TIME_BUDGET_MS) {
      const allProducts = await prisma.product.findMany({
        select: { id: true, name: true, brand: true },
      });
      // 기존 alias 캐시 (충돌 빠르게 거름)
      const existingAliases = new Set(
        (await prisma.productAlias.findMany({ select: { alias: true } })).map(
          (a) => a.alias,
        ),
      );
      for (const p of allProducts) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) break;
        const candidates = generateAliasCandidates(p.name, p.brand);
        for (const alias of candidates) {
          if (existingAliases.has(alias)) continue;
          try {
            await prisma.productAlias.create({
              data: { productId: p.id, alias },
            });
            existingAliases.add(alias);
            aliasesCreated++;
          } catch {
            // unique 충돌 — silent skip
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      candidatesScanned: processed,
      updated,
      categoriesUpdated,
      aliasesCreated,
      byBrand: Object.fromEntries(byBrand),
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    console.error("[sync/brand-match] 실패", e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
