import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// GET /api/recalls — 최근 회수 정보 조회 (인증 불필요)
// query params: limit (default 20, max 100), barcode, q (productName/manufacturer LIKE)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 20 : limitRaw, 1), 100);
  const barcode = url.searchParams.get("barcode")?.trim();
  const q = url.searchParams.get("q")?.trim();

  const where: Prisma.RecallWhereInput = {};
  if (barcode) where.barcode = barcode;
  if (q) {
    where.OR = [
      { productName: { contains: q, mode: "insensitive" } },
      { manufacturer: { contains: q, mode: "insensitive" } },
    ];
  }

  const recalls = await prisma.recall.findMany({
    where,
    orderBy: { registeredAt: "desc" },
    take: limit,
  });

  return NextResponse.json(
    { ok: true, count: recalls.length, recalls },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}
