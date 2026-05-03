import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseReceipt } from "@/lib/ocr";
import { matchProduct, matchStore } from "@/lib/matcher";
import { getCurrentUser } from "@/lib/supabase/server";
import { uploadReceiptImage } from "@/lib/storage";

// Vercel 함수 timeout — OCR(CLOVA/Vision) + storage 업로드 + 매칭까지 60초 허용
export const maxDuration = 60;

// POST /api/receipts — 영수증 이미지 업로드 + OCR 파싱 + 자동 매칭 시도
// body: { imageBase64?: string }
// 로그인 사용자가 있으면 자동으로 contributor로 사용 (uploaderId 제거됨)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { imageBase64 } = body;

  if (imageBase64 && typeof imageBase64 === "string" && imageBase64.length > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "이미지 크기 초과 (8MB 제한)" }, { status: 413 });
  }

  const user = await getCurrentUser();
  const uploaderId = user?.id;

  let receipt, usedMock, source;
  try {
    const result = await parseReceipt(imageBase64 ?? null);
    receipt = result.receipt;
    usedMock = result.usedMock;
    source = result.source;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: msg,
        hint: "영수증을 더 밝은 곳에서 똑바로 찍거나, 글씨가 흐리지 않게 찍어주세요. 그래도 안 되면 OCR 환경변수(CLOVA_OCR_URL/SECRET) 확인 필요합니다.",
      },
      { status: 502 }
    );
  }

  // 매장 추론
  const storeId = await matchStore(receipt.storeHint);

  // Supabase Storage 업로드 시도 (실패하면 placeholder fallback)
  let imageUrl = imageBase64 ? "data:placeholder" : "mock://demo";
  let storagePath: string | undefined;
  if (imageBase64) {
    try {
      // PNG 시그니처 감지 — 아니면 jpg로 처리
      const isPng = imageBase64.startsWith("data:image/png") || imageBase64.includes("iVBORw0KGgo");
      const ext: "jpg" | "png" = isPng ? "png" : "jpg";
      const uploaded = await uploadReceiptImage(imageBase64, ext);
      imageUrl = uploaded.publicUrl;
      storagePath = uploaded.path;
    } catch (e) {
      // bucket 미존재/키 미설정/업로드 실패 → placeholder 유지
      console.warn("[receipts] Storage 업로드 실패, placeholder로 fallback:", (e as Error).message);
    }
  }

  // 영수증 레코드 저장
  const record = await prisma.receipt.create({
    data: {
      imageUrl,
      storagePath,
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
    source,
    storeId,
    storeHint: receipt.storeHint,
    receiptDate: receipt.receiptDate,
    totalAmount: receipt.totalAmount,
    items: matches,
  });
}

// PATCH /api/receipts — 사용자가 매칭/매장을 수정한 뒤 가격 일괄 확정
// 로그인 사용자만 자신이 업로드한 영수증을 확정 가능 (uploaderId 일치 검증)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { receiptId, storeId, items } = body as {
    receiptId: string;
    storeId: string;
    items: { productId: string; price: number; quantity: number }[];
  };

  if (!receiptId || !storeId || !Array.isArray(items)) {
    return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
  }

  const user = await getCurrentUser();
  const uploaderId = user?.id;

  // 영수증 소유자 검증 (다른 사람 영수증을 확정하는 걸 막음)
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    select: { uploaderId: true },
  });
  if (!receipt) {
    return NextResponse.json({ error: "영수증을 찾을 수 없음" }, { status: 404 });
  }
  if (receipt.uploaderId && receipt.uploaderId !== uploaderId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
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
