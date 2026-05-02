// 가격 알림 등록/조회/해제
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { z } from "zod";

const AlertSchema = z.object({
  productId: z.string(),
  threshold: z.number().int().positive(),
});

// GET /api/alerts — 내 알림 목록
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }
  const alerts = await prisma.priceAlert.findMany({
    where: { userId: user.id, active: true },
    include: { product: { select: { id: true, name: true, unit: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ alerts });
}

// POST /api/alerts — 알림 등록 (이미 있으면 임계가 업데이트)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = AlertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "유효하지 않은 입력", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // 사용자 보장
  await prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id, nickname: `사용자-${user.id.slice(0, 4)}` },
  });

  const alert = await prisma.priceAlert.upsert({
    where: { userId_productId: { userId: user.id, productId: parsed.data.productId } },
    update: { threshold: parsed.data.threshold, active: true },
    create: {
      userId: user.id,
      productId: parsed.data.productId,
      threshold: parsed.data.threshold,
      active: true,
    },
  });
  return NextResponse.json({ ok: true, alert });
}

// DELETE /api/alerts?productId=... — 해제
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId 필요" }, { status: 400 });
  }
  await prisma.priceAlert.deleteMany({
    where: { userId: user.id, productId },
  });
  return NextResponse.json({ ok: true });
}
