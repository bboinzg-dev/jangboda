// 홈 페이지 위젯용 가계부 요약 — 가벼운 KPI만 (전체 BudgetData보다 훨씬 작음)
// page.tsx의 ISR(60초)을 깨지 않기 위해 client-side fetch.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { budgetCategoryOf } from "@/lib/budgetCategory";
import { kstMonthKey } from "@/lib/kst";

export const dynamic = "force-dynamic";

const monthKey = kstMonthKey;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, authed: false });

  // 가계부 = 본인 contributor Price 또는 본인 uploader Receipt에 연결된 Price
  const myPrices = await prisma.price.findMany({
    where: {
      OR: [
        { contributorId: user.id },
        { receipt: { uploaderId: user.id, storeId: { not: null } } },
      ],
    },
    select: {
      listPrice: true,
      paidPrice: true,
      createdAt: true,
      product: { select: { name: true, category: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (myPrices.length === 0) {
    return NextResponse.json({ ok: true, authed: true, hasData: false });
  }

  const paidOf = (p: { paidPrice: number | null; listPrice: number | null }) =>
    p.paidPrice ?? p.listPrice ?? 0;

  // 이번 달 합계
  const curKey = monthKey(new Date());
  const thisMonth = myPrices
    .filter((p) => monthKey(p.createdAt) === curKey)
    .reduce((s, p) => s + paidOf(p), 0);

  // 누적 절약 = Σ(listPrice - paidPrice WHERE paidPrice<listPrice)
  let savedAmount = 0;
  for (const p of myPrices) {
    if (p.paidPrice != null && p.listPrice != null && p.paidPrice < p.listPrice) {
      savedAmount += p.listPrice - p.paidPrice;
    }
  }

  // 이번 달 카테고리 1위
  const catMap = new Map<string, number>();
  for (const p of myPrices) {
    if (monthKey(p.createdAt) !== curKey) continue;
    const cat = budgetCategoryOf(p.product?.name ?? "", p.product?.category);
    catMap.set(cat, (catMap.get(cat) ?? 0) + paidOf(p));
  }
  const sortedCats = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);
  const totalThisMonth = sortedCats.reduce((s, [, v]) => s + v, 0);
  const topCategory =
    sortedCats.length > 0 && totalThisMonth > 0
      ? {
          category: sortedCats[0][0],
          total: sortedCats[0][1],
          pct: Math.round((sortedCats[0][1] / totalThisMonth) * 100),
        }
      : null;

  return NextResponse.json(
    {
      ok: true,
      authed: true,
      hasData: true,
      thisMonth,
      savedAmount,
      topCategory,
      totalCount: myPrices.length,
    },
    {
      headers: {
        // 같은 user의 가계부 요약 — 1분 브라우저 캐시 + 5분 SWR
        // 영수증 등록 후 즉시 반영은 부담 없는 trade-off (1분 차이)
        "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}
