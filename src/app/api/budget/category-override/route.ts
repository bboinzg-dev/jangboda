// 사용자가 가계부에서 product의 카테고리를 직접 수정 (자동 분류 보정)
// 저장 형태: User.budgetCategoryOverrides = { [productId]: budgetCategory }
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  productId: z.string(),
  category: z.enum([
    "신선식품",
    "유제품",
    "가공·즉석식품",
    "음료",
    "주류",
    "양념·조미료",
    "곡물·면·빵",
    "과자·간식",
    "생활용품",
    "기타",
  ]),
});

const DeleteSchema = z.object({
  productId: z.string(),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "잘못된 입력" }, { status: 400 });
  }

  // 기존 overrides에 새 항목 추가
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { budgetCategoryOverrides: true },
  });
  const current = (dbUser?.budgetCategoryOverrides as Record<string, string>) ?? {};
  current[parsed.data.productId] = parsed.data.category;

  await prisma.user.update({
    where: { id: user.id },
    data: { budgetCategoryOverrides: current },
  });

  return NextResponse.json({ ok: true });
}

// override 해제 (자동 분류로 복귀)
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });

  const body = await req.json();
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "잘못된 입력" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { budgetCategoryOverrides: true },
  });
  const current = (dbUser?.budgetCategoryOverrides as Record<string, string>) ?? {};
  delete current[parsed.data.productId];

  await prisma.user.update({
    where: { id: user.id },
    data: { budgetCategoryOverrides: current },
  });

  return NextResponse.json({ ok: true });
}
