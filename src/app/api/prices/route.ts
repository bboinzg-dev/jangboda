import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const PriceSchema = z.object({
  productId: z.string(),
  storeId: z.string(),
  price: z.number().int().positive(),
  isOnSale: z.boolean().optional(),
  source: z.enum(["manual", "receipt"]).default("manual"),
  contributorId: z.string().optional(),
  receiptId: z.string().optional(),
});

// POST /api/prices — 수동 가격 등록 또는 영수증 매칭 후 일괄 등록
export async function POST(req: NextRequest) {
  const body = await req.json();
  const items = Array.isArray(body) ? body : [body];

  const created = [];
  for (const raw of items) {
    const parsed = PriceSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "유효하지 않은 입력", detail: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const price = await prisma.price.create({ data: parsed.data });
    created.push(price);

    // 기여자 포인트 적립 (수동 +5, 영수증 +2)
    if (parsed.data.contributorId) {
      const award = parsed.data.source === "manual" ? 5 : 2;
      await prisma.user.update({
        where: { id: parsed.data.contributorId },
        data: { points: { increment: award } },
      });
    }
  }

  return NextResponse.json({ ok: true, count: created.length });
}
