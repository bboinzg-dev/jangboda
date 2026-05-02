import { NextRequest, NextResponse } from "next/server";
import { lookupCattleTrace } from "@/lib/foodsafety/cattleTrace";

// GET /api/cattle-trace?id=<12자리 개체식별번호>
//
// 식약처 쇠고기 이력추적 API(I1810/I1820/I1830)를 on-demand 조회.
// 특정 개체의 이력은 변경이 거의 없으므로 CDN/SWR 길게 캐시.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim() ?? "";

  if (!id) {
    return NextResponse.json(
      {
        found: false,
        enttyIdNo: "",
        integrated: null,
        production: null,
        processes: [],
        source: "none",
        error: "개체식별번호(id) 쿼리가 필요합니다",
      },
      { status: 400 }
    );
  }

  const result = await lookupCattleTrace(id);

  return NextResponse.json(result, {
    headers: {
      // 특정 개체의 이력은 사실상 정적 — CDN 1일 / SWR 7일
      "Cache-Control":
        "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
