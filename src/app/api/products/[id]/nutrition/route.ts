import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  lookupNutrition,
  type NutritionLookupResult,
} from "@/lib/dataGoKr/nutrition";

// OCR 잡음 이름 감지 — "C_ 자연애찬_일반" 같은 케이스에서 외부 API에 던져도 엉뚱한 매칭이 캐시됨
// 휴리스틱:
//   - 언더스코어가 2개 이상 (영수증 OCR이 공백을 _로 인식한 흔적)
//   - 1~2글자짜리 영문 토큰이 있고 그 옆에 _가 붙은 패턴 (예: "C_", "A_")
//   - 토큰의 절반 이상이 길이 1 (잡음)
function looksLikeOcrJunk(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) return true;
  const underscoreCount = (trimmed.match(/_/g) ?? []).length;
  if (underscoreCount >= 2) return true;
  if (/(^|\s)[A-Za-z]{1,2}_/.test(trimmed)) return true;
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const single = tokens.filter((t) => t.length === 1).length;
    if (single / tokens.length >= 0.5) return true;
  }
  return false;
}

// nutrition 매칭 sanity check — 명백히 비현실적인 값이 들어오면 캐시 안 함
// 식품영양성분DB는 100g당 또는 1회 제공량당이지만, 단일 식품에서 다음은 거의 불가능:
//   - 포화지방 > 50g  (100g당 50g면 그 식품 절반이 포화지방 — 사실상 없음)
//   - 트랜스지방 > 5g (자연 트랜스지방 최댓값 권장)
//   - 단백질 + 지방 + 탄수 > 100g (100g 식품에서 불가능)
function nutritionLooksWrong(n: NutritionLookupResult["nutrition"]): boolean {
  if (!n) return false;
  if (n.saturatedFatG !== null && n.saturatedFatG > 50) return true;
  if (n.transFatG !== null && n.transFatG > 5) return true;
  const macroSum =
    (n.proteinG ?? 0) + (n.fatG ?? 0) + (n.carbsG ?? 0);
  if (macroSum > 100) return true;
  return false;
}

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

  // OCR 잡음 이름 가드 — "C_ 자연애찬_일반" 같은 이름은 외부 lookup하면 엉뚱한 식품에 매칭됨
  if (looksLikeOcrJunk(product.name)) {
    const skipResult: NutritionLookupResult = {
      found: false,
      foodCode: null,
      foodName: null,
      category: null,
      servingSize: null,
      nutrition: null,
      source: "none",
    };
    return NextResponse.json(skipResult, {
      status: 200,
      headers: {
        // 잡음 이름은 캐시 짧게 — 사용자가 product 이름 수정 시 빠르게 반영
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  }

  // 2) 외부 lookup — 카테고리 무관 (KAMIS 농수산물도 영양성분DB에 존재)
  const result = await lookupNutrition({
    productName: product.name,
    brand: product.brand ?? undefined,
  });

  // sanity check — 비현실적 영양값(포화지방 65g 등)이면 매칭 실패로 처리
  if (result.found && result.nutrition && nutritionLooksWrong(result.nutrition)) {
    const skipResult: NutritionLookupResult = {
      found: false,
      foodCode: null,
      foodName: null,
      category: null,
      servingSize: null,
      nutrition: null,
      source: "none",
    };
    return NextResponse.json(skipResult, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  }

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
