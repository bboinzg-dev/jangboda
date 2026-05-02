import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchRecalls } from "@/lib/recalls";
import { checkSyncAuth } from "@/lib/auth";

export const maxDuration = 60;

// POST /api/sync/recalls — 식약처 회수·판매중지 식품 정보 (I0490) 동기화
// externalSeq(RTRVLDSUSE_SEQ) 기준 upsert. Vercel Cron 또는 X-Sync-Token 인증.
export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const { recalls, usedMock, total, error } = await fetchRecalls();

  let inserted = 0;
  let updated = 0;
  for (const r of recalls) {
    const existing = await prisma.recall.findUnique({
      where: { externalSeq: r.externalSeq },
      select: { id: true },
    });
    await prisma.recall.upsert({
      where: { externalSeq: r.externalSeq },
      create: {
        externalSeq: r.externalSeq,
        productName: r.productName,
        manufacturer: r.manufacturer,
        barcode: r.barcode,
        reason: r.reason,
        grade: r.grade,
        productType: r.productType,
        foodTypeName: r.foodTypeName,
        packageUnit: r.packageUnit,
        manufacturedAt: r.manufacturedAt,
        expiryInfo: r.expiryInfo,
        recallMethod: r.recallMethod,
        imageUrls: r.imageUrls,
        manufacturerAddress: r.manufacturerAddress,
        manufacturerTel: r.manufacturerTel,
        licenseNo: r.licenseNo,
        reportNo: r.reportNo,
        registeredAt: r.registeredAt,
      },
      update: {
        productName: r.productName,
        manufacturer: r.manufacturer,
        barcode: r.barcode,
        reason: r.reason,
        grade: r.grade,
        productType: r.productType,
        foodTypeName: r.foodTypeName,
        packageUnit: r.packageUnit,
        manufacturedAt: r.manufacturedAt,
        expiryInfo: r.expiryInfo,
        recallMethod: r.recallMethod,
        imageUrls: r.imageUrls,
        manufacturerAddress: r.manufacturerAddress,
        manufacturerTel: r.manufacturerTel,
        licenseNo: r.licenseNo,
        reportNo: r.reportNo,
        registeredAt: r.registeredAt,
      },
    });
    if (existing) updated++;
    else inserted++;
  }

  return NextResponse.json({
    ok: true,
    inserted,
    updated,
    total,
    usedMock,
    error,
  });
}
