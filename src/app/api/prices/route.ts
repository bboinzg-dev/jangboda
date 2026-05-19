import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { getCurrentUser } from "@/lib/supabase/server";
import { checkContribAuth } from "@/lib/auth";
import { logError } from "@/lib/observability";

const PriceSchema = z.object({
  productId: z.string(),
  storeId: z.string(),
  listPrice: z.number().int().positive(),
  paidPrice: z.number().int().positive().nullable().optional(),
  promotionType: z.string().max(40).nullable().optional(),
  source: z.enum(["manual", "receipt"]).default("manual"),
  receiptId: z.string().optional(),
});

// 한 번에 등록 가능한 가격 행 상한 — 영수증 한 장이 보통 20~30품목,
// 50이면 정상 케이스 다 커버 + 봇 데이터 폭격 방지.
const MAX_ITEMS_PER_REQUEST = 50;

// POST /api/prices — 수동 가격 등록 (로그인 사용자만 contributor로 적립)
// 비로그인 사용자도 등록 가능하지만 origin 화이트리스트로 외부 봇 차단.
export async function POST(req: NextRequest) {
  // origin 검증 — 우리 사이트 UI에서만 호출 허용 (프로덕션 환경에서만 활성)
  const blocked = checkContribAuth(req);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  if (body == null) {
    return NextResponse.json({ error: "유효하지 않은 JSON" }, { status: 400 });
  }
  const items = Array.isArray(body) ? body : [body];

  if (items.length === 0) {
    return NextResponse.json({ error: "빈 요청" }, { status: 400 });
  }
  if (items.length > MAX_ITEMS_PER_REQUEST) {
    return NextResponse.json(
      { error: `한 번에 최대 ${MAX_ITEMS_PER_REQUEST}건까지 등록 가능` },
      { status: 413 }
    );
  }

  // 트랜잭션 진입 전에 일괄 zod 검증 — 부분 성공·롤백 비용 절약
  const parsed: z.infer<typeof PriceSchema>[] = [];
  for (const raw of items) {
    const r = PriceSchema.safeParse(raw);
    if (!r.success) {
      return NextResponse.json(
        { error: "입력 형식 오류", detail: r.error.flatten() },
        { status: 400 }
      );
    }
    parsed.push(r.data);
  }

  // 로그인 사용자 자동 contributor 매핑
  const user = await getCurrentUser();
  const contributorId = user?.id;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const d of parsed) {
        const price = await tx.price.create({
          data: {
            productId: d.productId,
            storeId: d.storeId,
            listPrice: d.listPrice,
            paidPrice: d.paidPrice ?? null,
            promotionType: d.promotionType ?? null,
            source: d.source,
            receiptId: d.receiptId,
            contributorId,
          },
        });
        rows.push(price);
      }

      // 포인트 적립 — 로그인 사용자만 (수동 +5/건, 영수증 +2/건)
      if (contributorId) {
        const award = parsed.reduce(
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

      return rows;
    });

    return NextResponse.json({
      ok: true,
      count: created.length,
      awarded: !!contributorId,
    });
  } catch (e) {
    logError("api/prices.POST", e, { itemCount: parsed.length, contributorId });
    return NextResponse.json(
      { error: "가격 등록 실패 — 잠시 후 다시 시도해주세요" },
      { status: 500 }
    );
  }
}
