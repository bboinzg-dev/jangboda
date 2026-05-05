import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  lookupNutrition,
  type NutritionLookupResult,
} from "@/lib/dataGoKr/nutrition";

// GET /api/products/[id]/nutrition
// 1순위: Product.metadata.nutrition 캐시 (parsa enrich cron 또는 첫 호출이 채움) — 외부 API skip
// 2순위: data.go.kr 식품영양성분DB on-demand lookup → 결과를 metadata에 저장(이후 캐시 적중)
// CDN: 1일 s-maxage + 7일 SWR
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    select: { name: true, brand: true, category: true, metadata: true },
  });
  if (!product) {
    return NextResponse.json(
      { error: "상품을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 1) metadata 캐시 확인 — parsa enrich로 채워진 nutrition 그대로 사용
  const meta = product.metadata as Record<string, unknown> | null;
  const cachedNutrition = meta?.nutrition;
  if (cachedNutrition && typeof cachedNutrition === "object") {
    const cachedCategory = meta?.category;
    // 캐시 응답은 source="datagokr"로 표시 (실제 출처가 외부 API였던 데이터)
    const cacheResponse: NutritionLookupResult = {
      found: true,
      foodCode: typeof meta?.foodCode === "string" ? meta.foodCode : null,
      foodName: product.name,
      category:
        typeof cachedCategory === "string" ? cachedCategory : product.category,
      servingSize:
        typeof meta?.servingSize === "string" ? meta.servingSize : null,
      nutrition: cachedNutrition as NutritionLookupResult["nutrition"],
      source: "datagokr",
    };
    return NextResponse.json(
      cacheResponse,
      {
        status: 200,
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  }

  // 2) 외부 lookup — 카테고리 무관 (KAMIS 농수산물도 영양성분DB에 존재)
  const result = await lookupNutrition({
    productName: product.name,
    brand: product.brand ?? undefined,
  });

  // 결과를 metadata에 저장하면 다음 호출은 1)에서 즉시 적중
  if (result.found && result.nutrition) {
    try {
      await prisma.product.update({
        where: { id: params.id },
        data: {
          metadata: {
            ...(meta ?? {}),
            nutrition: result.nutrition,
            foodCode: result.foodCode,
            servingSize: result.servingSize,
          } as Prisma.InputJsonValue,
        },
      });
    } catch {
      // 캐시 저장 실패는 무시 — 응답은 정상 반환
    }
  }

  return NextResponse.json(result, {
    status: 200,
    headers: {
      "Cache-Control":
        "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
