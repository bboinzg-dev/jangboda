import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// GET /api/health-functional
// 건강기능식품 카테고리/원료 검색 API.
// Query:
//   ?type=category|rawmaterial — 미지정 시 둘 다 반환
//   ?q=...                     — groupName / rawMaterialName 부분 일치
//   ?limit=N                   — 기본 50, 최대 200
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type")?.trim().toLowerCase();
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limitParam = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(
    Math.max(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50, 1),
    200
  );

  const wantCategory = !type || type === "category";
  const wantRawMaterial = !type || type === "rawmaterial";

  let categories: Array<{
    id: string;
    groupCode: string;
    groupName: string;
    largeCategoryName: string | null;
    midCategoryName: string | null;
    smallCategoryName: string | null;
  }> = [];
  let rawMaterials: Array<{
    id: string;
    recognitionNo: string;
    rawMaterialName: string;
    weightUnit: string | null;
    dailyIntakeMin: string | null;
    dailyIntakeMax: string | null;
    primaryFunction: string | null;
    warning: string | null;
  }> = [];

  try {
    if (wantCategory) {
      const where: Prisma.HealthFunctionalCategoryWhereInput = q
        ? { groupName: { contains: q, mode: "insensitive" } }
        : {};
      categories = await prisma.healthFunctionalCategory.findMany({
        where,
        orderBy: [{ largeCategoryName: "asc" }, { groupName: "asc" }],
        take: limit,
        select: {
          id: true,
          groupCode: true,
          groupName: true,
          largeCategoryName: true,
          midCategoryName: true,
          smallCategoryName: true,
        },
      });
    }

    if (wantRawMaterial) {
      const where: Prisma.HealthFunctionalRawMaterialWhereInput = q
        ? { rawMaterialName: { contains: q, mode: "insensitive" } }
        : {};
      rawMaterials = await prisma.healthFunctionalRawMaterial.findMany({
        where,
        orderBy: { rawMaterialName: "asc" },
        take: limit,
        select: {
          id: true,
          recognitionNo: true,
          rawMaterialName: true,
          weightUnit: true,
          dailyIntakeMin: true,
          dailyIntakeMax: true,
          primaryFunction: true,
          warning: true,
        },
      });
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: "조회 실패",
        message: e instanceof Error ? e.message : String(e),
        categories: [],
        rawMaterials: [],
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { categories, rawMaterials },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
