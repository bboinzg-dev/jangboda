// 가계부에 영수증 없이 거래 직접 추가 (현금 결제, 외식, 시장 등)
//
// 흐름:
// 1. "사용자 직접 입력" chain (없으면 생성) — 모든 수동 입력 매장 통합
// 2. store: 사용자가 입력한 매장명으로 chain 내 unique upsert
// 3. product: 사용자가 입력한 상품명으로 새 생성 또는 기존 사용
// 4. category: 사용자가 지정한 카테고리를 budgetCategoryOverrides에 저장
// 5. Price: source="manual", listPrice=amount, contributorId=user
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Schema = z.object({
  storeName: z.string().trim().min(1).max(100),
  productName: z.string().trim().min(1).max(200),
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
  amount: z.number().int().positive().max(100_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인 필요" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "입력 오류", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { storeName, productName, category, amount, date } = parsed.data;

  // 1. 사용자 직접 입력 chain
  const chain = await prisma.chain.upsert({
    where: { name: "사용자 직접 입력" },
    update: {},
    create: { name: "사용자 직접 입력", category: "manual" },
  });

  // 2. store — 같은 chain 내 같은 이름이면 재사용
  let store = await prisma.store.findFirst({
    where: { chainId: chain.id, name: storeName },
  });
  if (!store) {
    store = await prisma.store.create({
      data: {
        chainId: chain.id,
        name: storeName,
        address: "사용자 직접 입력",
        lat: 0,
        lng: 0,
      },
    });
  }

  // 3. product — 같은 이름이면 재사용 (다른 사용자가 만든 product도 매칭)
  let product = await prisma.product.findFirst({
    where: { name: productName },
  });
  if (!product) {
    product = await prisma.product.create({
      data: {
        name: productName,
        category: "사용자 등록",
        unit: "1개",
      },
    });
  }

  // 4. 카테고리 override 저장 (다른 사용자가 만든 product여도 본인 가계부엔 본인이 지정한 카테고리)
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { budgetCategoryOverrides: true },
  });
  const overrides =
    (dbUser?.budgetCategoryOverrides as Record<string, string>) ?? {};
  overrides[product.id] = category;
  await prisma.user.update({
    where: { id: user.id },
    data: { budgetCategoryOverrides: overrides },
  });

  // 5. Price 생성
  const priceCreatedAt = new Date(date);
  if (isNaN(priceCreatedAt.getTime())) {
    return NextResponse.json({ ok: false, error: "날짜 오류" }, { status: 400 });
  }
  await prisma.price.create({
    data: {
      productId: product.id,
      storeId: store.id,
      listPrice: amount,
      paidPrice: null,
      promotionType: null,
      source: "manual",
      contributorId: user.id,
      createdAt: priceCreatedAt,
    },
  });

  return NextResponse.json({ ok: true });
}
