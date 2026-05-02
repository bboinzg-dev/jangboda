// 바코드 → 제품 정보 lookup (식품안전나라 I2570)
// 향후 바코드 스캔 UI / 영수증 매칭 정정 흐름에서 활용
import { NextRequest, NextResponse } from "next/server";
import { lookupByBarcode, searchByName } from "@/lib/foodsafety";

export const revalidate = 3600; // 1시간 캐시 (식품 정보는 자주 안 바뀜)

// GET /api/products/lookup-barcode?barcode=8801043... or ?q=신라면
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const barcode = searchParams.get("barcode");
  const q = searchParams.get("q");

  if (barcode) {
    const item = await lookupByBarcode(barcode);
    if (!item) {
      return NextResponse.json(
        { found: false, message: "해당 바코드의 제품을 찾을 수 없습니다" },
        { status: 404 }
      );
    }
    // C005에서 같은 바코드의 여러 row(공장별 보고)를 가져왔을 수 있음 — best 1건
    return NextResponse.json({
      found: true,
      item,
      // UI에서 보기 좋게 정리된 필드
      summary: {
        name: item.productName,
        manufacturer: item.manufacturer,
        type: item.foodType,
        shelfLife: item.shelfLife,
        address: item.manufacturerAddress,
        category: item.category,
      },
    });
  }

  if (q) {
    const items = await searchByName(q, 20);
    return NextResponse.json({ count: items.length, items });
  }

  return NextResponse.json(
    { error: "barcode 또는 q 파라미터 필요" },
    { status: 400 }
  );
}
