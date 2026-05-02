import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/agritrace — 농산물이력추적 공개 조회 API
//   ?regNo=...       : 이력추적등록번호 정확 일치
//   ?q=...           : 대표품목명(rprsntPrdltName) LIKE 검색
//   ?orgn=...        : 단체/농가명(orgnName) LIKE 검색
//   ?limit=N         : 결과 개수 (기본 20, 최대 100)
//
// 캐시: CDN 1일 / SWR 7일 — 데이터가 자주 변하지 않음
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const regNo = url.searchParams.get("regNo")?.trim();
  const q = url.searchParams.get("q")?.trim();
  const orgn = url.searchParams.get("orgn")?.trim();
  const limitParam = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20, 1),
    100
  );

  try {
    // regNo 우선 — 정확 일치 단건 조회
    if (regNo) {
      const item = await prisma.agriTrace.findUnique({
        where: { histTraceRegNo: regNo },
      });
      const body = { items: item ? [item] : [], count: item ? 1 : 0 };
      return NextResponse.json(body, {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      });
    }

    // q 또는 orgn LIKE 검색 — Prisma contains (case-insensitive로 두지 않음, 한글이라 의미 적음)
    const where: Record<string, unknown> = {};
    if (q) {
      where.rprsntPrdltName = { contains: q };
    }
    if (orgn) {
      where.orgnName = { contains: orgn };
    }

    // 검색 조건 없으면 최근 등록순 반환 (디폴트 리스팅)
    const items = await prisma.agriTrace.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(
      { items, count: items.length },
      {
        headers: {
          "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      {
        items: [],
        count: 0,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
