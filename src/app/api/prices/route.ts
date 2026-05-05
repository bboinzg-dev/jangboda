import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";

const PriceSchema = z.object({
  productId: z.string(),
  storeId: z.string(),
  // 호환성을 위해 price도 받음. listPrice 미전송 시 price를 정가로 사용.
  price: z.number().int().positive().optional(),
  listPrice: z.number().int().positive().optional(),
  paidPrice: z.number().int().positive().nullable().optional(),
  promotionType: z.string().max(40).nullable().optional(),
  isOnSale: z.boolean().optional(),
  source: z.enum(["manual", "receipt"]).default("manual"),
  receiptId: z.string().optional(),
}).refine((v) => v.price != null || v.listPrice != null, {
  message: "price 또는 listPrice 중 하나는 필수",
});

// POST /api/prices — 수동 가격 등록 (로그인 사용자만 contributor로 적립)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const items = Array.isArray(body) ? body : [body];

  // 로그인 사용자 자동 contributor 매핑
  const user = await getCurrentUser();
  const contributorId = user?.id;

  const created = [];
  await prisma.$transaction(async (tx) => {
    for (const raw of items) {
      const parsed = PriceSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error(JSON.stringify(parsed.error.flatten()));
      }
      const d = parsed.data;
      const listPrice = d.listPrice ?? d.price!;
      const paidPrice = d.paidPrice ?? null;
      const isOnSale = d.isOnSale ?? (paidPrice != null && paidPrice < listPrice);
      const price = await tx.price.create({
        data: {
          productId: d.productId,
          storeId: d.storeId,
          listPrice,
          paidPrice,
          promotionType: d.promotionType ?? null,
          // 호환 (Phase 6 제거): paidPrice 있으면 그걸, 없으면 listPrice
          price: paidPrice ?? listPrice,
          isOnSale,
          source: d.source,
          receiptId: d.receiptId,
          contributorId,
        },
      });
      created.push(price);
    }

    // 포인트 적립 — 로그인 사용자만 (수동 +5/건, 영수증 +2/건)
    if (contributorId) {
      const award = items.reduce(
        (sum, i) => sum + (i.source === "receipt" ? 2 : 5),
        0
      );
      await tx.user.upsert({
        where: { id: contributorId },
        update: { points: { increment: award } },
        create: {
          id: contributorId,
          nickname: `사용자-${contributorId.slice(0, 4)}`,
          points: award,
        },
      });
    }
  });

  return NextResponse.json({ ok: true, count: created.length, awarded: !!contributorId });
}
