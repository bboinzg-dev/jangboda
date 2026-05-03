// ParsaProduct + 시드 Product를 식약처/영양성분DB로 enrich
//
// 목적: ParsaProduct(604개) + 시드(7개) ≈ 611개 Product 레코드의
//       barcode/manufacturer/category/metadata.nutrition을 외부 API로 채움
//
// 사용 API:
//   - 식약처 I2570 (가공식품 바코드): barcode, category(소분류), manufacturer
//   - 식약처 C005 (바코드연계): manufacturer, foodType, shelfLife (lookup용)
//   - data.go.kr 식품영양성분DB: metadata.nutrition (energyKcal/proteinG/fatG/...)
//   - HACCP은 manufacturer 채워지면 다른 cron이 자동 매칭 — 여기선 안 다룸
//
// Cron: 매주 토요일 23시 (다른 parsa cron 다 끝난 후)
// chain self-trigger로 한 번 호출하면 전체 cover (~30분)

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import { findBestMatchForProduct } from "@/lib/foodsafety";
import { lookupNutrition } from "@/lib/dataGoKr/nutrition";

export const maxDuration = 60;

// POST /api/sync/parsa/enrich
// Query params:
//   ?from=N&limit=N (default 30)  — partial-resume
//   ?chain=true                    — 자동 self-trigger (한 번 호출로 전체 cover)
//   ?type=foodsafety|nutrition|both (default both)
export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 50_000;

  const url = new URL(req.url);
  const from = Math.max(0, parseInt(url.searchParams.get("from") ?? "0", 10) || 0);
  const limit = Math.min(
    50,
    Math.max(10, parseInt(url.searchParams.get("limit") ?? "30", 10))
  );
  const chain = url.searchParams.get("chain") === "true";
  const type = url.searchParams.get("type") ?? "both";
  const doFoodsafety = type === "foodsafety" || type === "both";
  const doNutrition = type === "nutrition" || type === "both";

  // ParsaProduct만 enrich — 시드 7개는 식약처 SKU 없는 항목들이라 시간 낭비
  const baseWhere = {
    category: { not: "농수산물" },
    externalId: { startsWith: "parsa:product:" },
  };
  const total = await prisma.product.count({ where: baseWhere });
  const products = await prisma.product.findMany({
    where: baseWhere,
    select: {
      id: true,
      name: true,
      brand: true,
      manufacturer: true,
      barcode: true,
      category: true,
    },
    skip: from,
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  let foodsafetyMatched = 0;
  let nutritionMatched = 0;
  let failed = 0;
  const debugLog: Array<{ name: string; fsResult: string; nutritionResult: string }> = [];
  const isDebug = url.searchParams.get("debug") === "true";

  for (const p of products) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;

    const updates: Prisma.ProductUncheckedUpdateInput = {};
    let metadataPatch: Record<string, unknown> | null = null;
    let fsDebug = "skip";
    let nutDebug = "skip";

    // 1) 식약처 enrich — barcode/manufacturer 비어있을 때만
    if (doFoodsafety && (!p.barcode || !p.manufacturer)) {
      try {
        const fs = await findBestMatchForProduct(p.name, p.brand, { minScore: 3 });
        if (fs) {
          if (!p.barcode && fs.barcode) updates.barcode = fs.barcode;
          if (!p.manufacturer && fs.manufacturer) updates.manufacturer = fs.manufacturer;
          if (fs.category?.minor && p.category === "참가격 등록 상품") {
            updates.category = fs.category.minor;
          }
          foodsafetyMatched++;
          fsDebug = `match:${fs.productName}|brand=${fs.manufacturer}|barcode=${fs.barcode}`;
        } else {
          fsDebug = "no match";
        }
      } catch (e) {
        failed++;
        fsDebug = `error:${e instanceof Error ? e.message : String(e)}`;
      }
    }

    if (isDebug) debugLog.push({ name: p.name, fsResult: fsDebug, nutritionResult: nutDebug });

    // 2) 영양정보 enrich
    if (doNutrition) {
      try {
        const nut = await lookupNutrition({
          productName: p.name,
          brand: p.brand ?? undefined,
        });
        if (nut.found && nut.nutrition) {
          metadataPatch = {
            nutrition: nut.nutrition,
            foodCode: nut.foodCode,
            servingSize: nut.servingSize,
          };
          nutritionMatched++;
        }
      } catch {
        // 영양정보는 best-effort — 실패해도 무시
      }
    }

    // DB 적용
    if (Object.keys(updates).length > 0 || metadataPatch) {
      try {
        await prisma.product.update({
          where: { id: p.id },
          data: {
            ...updates,
            ...(metadataPatch
              ? { metadata: metadataPatch as Prisma.InputJsonValue }
              : {}),
          } as Prisma.ProductUncheckedUpdateInput,
        });
      } catch {
        failed++;
      }
    }
  }

  const processedThrough = from + products.length;
  const partial = processedThrough < total;

  // chain self-trigger — 한 번 호출로 전체 cover
  if (chain && partial) {
    const host = req.headers.get("host");
    if (host) {
      const proto = host.startsWith("localhost") ? "http" : "https";
      const params = new URLSearchParams({
        from: String(processedThrough),
        limit: String(limit),
        chain: "true",
        type,
      });
      void fetch(`${proto}://${host}/api/sync/parsa/enrich?${params.toString()}`, {
        method: "POST",
        headers: { "X-Sync-Token": process.env.SYNC_TOKEN ?? "" },
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    type,
    total,
    processed: products.length,
    foodsafetyMatched,
    nutritionMatched,
    failed,
    partial,
    processedThrough,
    elapsedMs: Date.now() - startedAt,
    ...(isDebug ? { debug: debugLog } : {}),
  });
}

// Vercel Cron은 GET로 호출 — POST로 위임
export async function GET(req: NextRequest) {
  return POST(req);
}
