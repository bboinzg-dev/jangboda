import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeBsshName } from "@/lib/foodsafety/haccp";

// GET /api/haccp?manufacturer=농심
// GET /api/haccp?licenseNo=12345678
//
// 매칭되는 HACCP 적용업소 정보 반환. 폐업/취소는 제외 (영업중만).
// 캐시: HACCP 정보는 거의 안 변함 — 1일 CDN 캐시 + 7일 stale-while-revalidate.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const licenseNo = url.searchParams.get("licenseNo")?.trim();
  const manufacturer = url.searchParams.get("manufacturer")?.trim();

  if (!licenseNo && !manufacturer) {
    return NextResponse.json(
      { error: "manufacturer 또는 licenseNo 쿼리 파라미터가 필요합니다" },
      { status: 400 }
    );
  }

  if (licenseNo) {
    const facility = await prisma.haccpFacility.findUnique({
      where: { licenseNo },
    });
    return NextResponse.json(
      { facility },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  }

  // manufacturer 매칭 — 정확 일치 우선, 그 다음 contains
  const norm = normalizeBsshName(manufacturer!);
  if (norm.length < 2) {
    return NextResponse.json(
      { facilities: [] },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  }

  // 폐업/취소 제외
  const facilities = await prisma.haccpFacility.findMany({
    where: {
      bsshNameNorm: { contains: norm },
      NOT: [
        { bizStatus: { contains: "폐업" } },
        { bizStatus: { contains: "취소" } },
      ],
    },
    orderBy: { appnDate: "desc" },
    take: 20,
  });

  // 정확 일치 우선 정렬
  const exact = facilities.filter((f) => f.bsshNameNorm === norm);
  const partial = facilities.filter((f) => f.bsshNameNorm !== norm);

  return NextResponse.json(
    {
      facilities: [...exact, ...partial],
      matched: facilities.length > 0,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
