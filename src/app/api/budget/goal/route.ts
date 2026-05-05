// 월 예산 (BudgetGoal) — 본인만 조회/설정
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  monthlyAmount: z.number().int().min(0).max(100_000_000),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, authed: false });

  const goal = await prisma.budgetGoal.findUnique({
    where: { userId: user.id },
    select: { monthlyAmount: true, updatedAt: true },
  });

  return NextResponse.json({
    ok: true,
    authed: true,
    monthlyAmount: goal?.monthlyAmount ?? null,
    updatedAt: goal?.updatedAt ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "잘못된 입력" }, { status: 400 });
  }

  const { monthlyAmount } = parsed.data;
  const goal = await prisma.budgetGoal.upsert({
    where: { userId: user.id },
    update: { monthlyAmount },
    create: { userId: user.id, monthlyAmount },
    select: { monthlyAmount: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, monthlyAmount: goal.monthlyAmount });
}
