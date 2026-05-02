import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseReceipt } from "@/lib/ocr";
import { matchProduct, matchStore } from "@/lib/matcher";

// POST /api/receipts — 영수증 이미지 업로드 + OCR 파싱 + 자동 매칭 시도
// body: { imageBase64?: string, uploaderId?: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { imageBase64, uploaderId } = body;

  // 입력 크기 제한 — base64는 약 1.33배 부풀림. 8MB까지 허용 (사진 한 장 기준)
  if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "이미지 크기 초과 (8MB 제한)" }, { status: 413 });
  }

  const { receipt, usedMock } = await parseReceipt(imageBase64 ?? null);

  // 매장 추론
  const storeId = await matchStore(receipt.storeHint);

  // 영수증 레코드 저장
  const record = await prisma.receipt.create({
    data: {
      imageUrl: imageBase64 ? "data:placeholder" : "mock://demo",
      storeId: storeId ?? undefined,
      uploaderId: uploaderId ?? undefined,
      rawOcrText: receipt.rawText,
      parsedJson: JSON.stringify(receipt),
      status: "parsed",
    },
  });

  // 각 품목을 카탈로그에 매칭
  const matches = await Promise.all(
    receipt.items.map(async (it) => ({
      rawName: it.rawName,
      price: it.price,
      quantity: it.quantity,
      productId: await matchProduct(it.rawName),
    }))
  );

  return NextResponse.json({
    receiptId: record.id,
    usedMock,
    storeId,
    storeHint: receipt.storeHint,
    receiptDate: receipt.receiptDate,
    totalAmount: receipt.totalAmount,
    items: matches,
  });
}

// PATCH /api/receipts — 사용자가 매칭/매장을 수정한 뒤 가격 일괄 확정
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { receiptId, storeId, items, uploaderId } = body as {
    receiptId: string;
    storeId: string;
    uploaderId?: string;
    items: { productId: string; price: number; quantity: number }[];
  };

  if (!receiptId || !storeId || !Array.isArray(items)) {
    return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
  }

  const validItems = items.filter((i) => i.productId && i.price > 0);
  if (validItems.length === 0) {
    return NextResponse.json({ error: "확정할 항목 없음" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.receipt.update({
      where: { id: receiptId },
      data: { storeId, status: "verified" },
    });

    for (const it of validItems) {
      await tx.price.create({
        data: {
          productId: it.productId,
          storeId,
          price: it.price,
          source: "receipt",
          contributorId: uploaderId,
          receiptId,
        },
      });
    }

    if (uploaderId) {
      await tx.user.update({
        where: { id: uploaderId },
        data: { points: { increment: validItems.length * 2 } },
      });
    }
  });

  return NextResponse.json({ ok: true, count: validItems.length });
}
