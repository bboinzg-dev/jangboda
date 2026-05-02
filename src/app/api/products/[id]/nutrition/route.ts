import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lookupNutrition } from "@/lib/dataGoKr/nutrition";

// GET /api/products/[id]/nutrition
// data.go.kr 식품의약품안전처 식품영양성분DB(FoodNtrCpntDbInfo02)에서 on-demand로 영양정보 조회.
// 영양정보는 본질적으로 정적이므로 CDN에서 1일 캐시 + 7일 SWR.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    select: { name: true, brand: true, category: true },
  });
  if (!product) {
    return NextResponse.json(
      { error: "상품을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 카테고리와 무관하게 lookup 시도. KAMIS 농수산물(사과, 배추 등)도 식품영양성분DB에 존재.
  const result = await lookupNutrition({
    productName: product.name,
    brand: product.brand ?? undefined,
  });

  return NextResponse.json(result, {
    status: 200,
    headers: {
      "Cache-Control":
        "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
