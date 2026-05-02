import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { lookupIngredients } from "@/lib/foodsafety/ingredients";

// GET /api/products/[id]/ingredients
// 식약처 C002에서 on-demand로 원재료 정보 조회.
// 자주 변하지 않으므로 CDN에서 1시간 캐시 + 24시간 SWR.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const product = await prisma.product.findUnique({
    where: { id: params.id },
    select: { name: true, manufacturer: true, brand: true },
  });
  if (!product) {
    return NextResponse.json(
      { error: "상품을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // brand가 name 앞에 붙어있는 경우 제거 ("농심 신라면" → "신라면")
  const brand = product.brand ?? "";
  const cleanedName = brand
    ? product.name.replace(brand, "").trim()
    : product.name.trim();

  const result = await lookupIngredients({
    productName: cleanedName || product.name,
    manufacturer: product.manufacturer ?? product.brand ?? undefined,
  });

  return NextResponse.json(result, {
    status: 200,
    headers: {
      "Cache-Control":
        "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
