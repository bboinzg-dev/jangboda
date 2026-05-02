import { NextRequest, NextResponse } from "next/server";
import { lookupSeafoodTrace } from "@/lib/foodsafety/seafoodTrace";

// GET /api/seafood-trace?regNo=...
//
// 식약처 수산물이력 API I1920/I1930/I1940 on-demand lookup.
// 캐시: CDN 1일 / SWR 7일 — 등록 정보는 자주 변하지 않음.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const regNo = url.searchParams.get("regNo")?.trim() ?? "";

  if (!regNo) {
    return NextResponse.json(
      {
        found: false,
        regNo: "",
        basic: null,
        productions: [],
        releases: [],
        source: "none",
        error: "regNo 쿼리 파라미터가 필요합니다",
      },
      { status: 400 }
    );
  }

  try {
    const result = await lookupSeafoodTrace(regNo);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control":
          "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        found: false,
        regNo,
        basic: null,
        productions: [],
        releases: [],
        source: "none",
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
