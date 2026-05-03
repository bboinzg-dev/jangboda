import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// GET /api/parsa/products
// query params:
//   - q: goodName LIKE 검색
//   - type: (현재 필터 미사용 — 상품은 매장에 종속되지 않음, 호환용으로만 받음)
//   - category: goodSmlclsCode prefix (예: "030")
//   - limit: 1~100 (기본 20)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const category = url.searchParams.get("category")?.trim();
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 20 : limitRaw, 1), 100);

  const where: Prisma.ParsaProductWhereInput = {};
  if (q) {
    where.goodName = { contains: q, mode: "insensitive" };
  }
  if (category) {
    where.goodSmlclsCode = { startsWith: category };
  }

  const products = await prisma.parsaProduct.findMany({
    where,
    orderBy: { goodName: "asc" },
    take: limit,
    select: {
      goodId: true,
      goodName: true,
      productEntpCode: true,
      goodSmlclsCode: true,
      goodUnitDivCode: true,
      goodBaseCnt: true,
      goodTotalCnt: true,
      goodTotalDivCode: true,
      detailMean: true,
    },
  });

  return NextResponse.json(
    { ok: true, count: products.length, products },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
