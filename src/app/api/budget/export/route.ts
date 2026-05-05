// 가계부 CSV 내보내기 — 사용자가 자신의 거래 내역을 직접 다운로드
// Excel에서 한글 깨짐 방지 위해 UTF-8 BOM 포함.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { budgetCategoryOf } from "@/lib/budgetCategory";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const myPrices = await prisma.price.findMany({
    where: {
      OR: [
        { contributorId: user.id },
        { receipt: { uploaderId: user.id, storeId: { not: null } } },
      ],
    },
    include: {
      product: { select: { name: true, category: true } },
      store: { include: { chain: { select: { name: true } } } },
      receipt: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const escape = (v: string | number | null | undefined): string => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const header = [
    "거래일",
    "매장 chain",
    "매장명",
    "상품명",
    "카테고리",
    "정가(원)",
    "행사가(원)",
    "실제지출(원)",
    "행사유형",
    "출처",
    "영수증ID",
  ].join(",");

  const rows = myPrices.map((p) => {
    const cat = budgetCategoryOf(p.product?.name ?? "", p.product?.category);
    const paid = p.paidPrice ?? p.listPrice ?? 0;
    return [
      p.createdAt.toISOString().slice(0, 10),
      p.store?.chain?.name ?? "",
      p.store?.name ?? "",
      p.product?.name ?? "",
      cat,
      p.listPrice ?? "",
      p.paidPrice ?? "",
      paid,
      p.promotionType ?? "",
      p.source,
      p.receipt?.id ?? "",
    ]
      .map(escape)
      .join(",");
  });

  // ﻿ = UTF-8 BOM (Excel 한글 인식)
  const csv = "﻿" + header + "\n" + rows.join("\n");
  const filename = `jangboda-budget-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
