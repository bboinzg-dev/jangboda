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

  // 페이지 내 동일 externalSeq 중복 제거 (안전성)
  const seen = new Set<string>();
  const inputItems: typeof recalls = [];
  for (const r of recalls) {
    if (seen.has(r.externalSeq)) continue;
    seen.add(r.externalSeq);
    inputItems.push(r);
  }

  // 1) 한 번의 쿼리로 기존 externalSeq 조회
  const allKeys = inputItems.map((r) => r.externalSeq);
  const existingRows = await prisma.recall.findMany({
    where: { externalSeq: { in: allKeys } },
    select: { externalSeq: true },
  });
  const existingSet = new Set(existingRows.map((r) => r.externalSeq));

  // 2) 신규는 createMany 일괄 삽입
  const toCreate = inputItems
    .filter((r) => !existingSet.has(r.externalSeq))
    .map((r) => ({
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
    }));

  let inserted = 0;
  if (toCreate.length > 0) {
    await prisma.recall.createMany({ data: toCreate, skipDuplicates: true });
    inserted = toCreate.length;
  }

  // 3) 기존 레코드는 50개씩 병렬 update
  const toUpdate = inputItems.filter((r) => existingSet.has(r.externalSeq));
  let updated = 0;
  const CHUNK = 50;
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const slice = toUpdate.slice(i, i + CHUNK);
    await Promise.all(
      slice.map((r) =>
        prisma.recall.update({
          where: { externalSeq: r.externalSeq },
          data: {
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
        })
      )
    );
    updated += slice.length;
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
