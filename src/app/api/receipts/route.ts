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

// PATCH /api/receipts — 영수증 확정
// 매칭된 항목: 그 product에 가격 추가. 매칭 안 된 항목: 새 product 생성 + 가격 추가.
// items[].productId === "" 또는 productId === "__new__" → 신규 등록 (rawName으로 product 생성)
// receiptDate 받으면 Price.createdAt에 사용 (영수증 실제 거래일 반영)
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const {
    receiptId,
    storeId,
    items,
    receiptDate,
  } = body as {
    receiptId: string;
    storeId: string;
    items: {
      productId: string | null;
      price: number;
      quantity: number;
      rawName?: string; // 신규 등록 시 product name으로 사용
      isNew?: boolean; // 신규 등록 의도
    }[];
    receiptDate?: string; // YYYY-MM-DD — 영수증 거래일
  };

  if (!receiptId || !storeId || !Array.isArray(items)) {
    return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
  }

  const user = await getCurrentUser();
  const uploaderId = user?.id;

  // 영수증 소유자 검증 + 중복 등록 방지
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    select: { uploaderId: true, status: true },
  });
  if (!receipt) {
    return NextResponse.json({ error: "영수증을 찾을 수 없음" }, { status: 404 });
  }
  if (receipt.uploaderId && receipt.uploaderId !== uploaderId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }
  // 이미 verified 상태면 재등록 거부 (같은 영수증 두 번 등록 방지)
  if (receipt.status === "verified") {
    return NextResponse.json(
      {
        error: "이미 등록된 영수증입니다",
        hint: "같은 영수증은 한 번만 등록할 수 있어요. 가계부에서 거래 내역을 확인해보세요.",
      },
      { status: 409 }
    );
  }

  // valid 분류:
  //   - 기존 매칭: productId 있고 price > 0
  //   - 신규 등록: isNew && rawName && price > 0
  const validMatched = items.filter(
    (i) => i.productId && !i.isNew && i.price > 0
  );
  const validNew = items.filter(
    (i) => i.isNew && i.rawName && i.rawName.trim() && i.price > 0
  );
  if (validMatched.length === 0 && validNew.length === 0) {
    return NextResponse.json({ error: "확정할 항목 없음" }, { status: 400 });
  }

  // 영수증 거래일 → Price.createdAt에 사용 (오늘 기본)
  const priceCreatedAt = (() => {
    if (!receiptDate) return undefined; // prisma 기본값(now()) 사용
    const d = new Date(receiptDate);
    if (isNaN(d.getTime())) return undefined;
    return d;
  })();

  let newProductsCreated = 0;
  let pricesCreated = 0;

  await prisma.$transaction(async (tx) => {
    await tx.receipt.update({
      where: { id: receiptId },
      data: { storeId, status: "verified" },
    });

    // idempotent: 같은 receiptId의 기존 Price 모두 제거 후 재등록
    // (사용자가 같은 영수증 두 번 등록해도 중복 안 생김)
    await tx.price.deleteMany({ where: { receiptId } });

    // 1) 기존 매칭 항목 → Price 추가
    for (const it of validMatched) {
      await tx.price.create({
        data: {
          productId: it.productId!,
          storeId,
          price: it.price,
          source: "receipt",
          contributorId: uploaderId,
          receiptId,
          ...(priceCreatedAt ? { createdAt: priceCreatedAt } : {}),
        },
      });
      pricesCreated++;
    }

    // 2) 신규 등록 항목 → Product 생성 + Price 추가
    for (const it of validNew) {
      const cleanName = (it.rawName ?? "").trim().slice(0, 200);
      // 같은 영수증에 같은 이름 중복 등록 방지: 이미 같은 이름의 product 있으면 그걸 사용
      const existing = await tx.product.findFirst({
        where: { name: cleanName },
        select: { id: true },
      });
      let productId: string;
      if (existing) {
        productId = existing.id;
      } else {
        const created = await tx.product.create({
          data: {
            name: cleanName,
            unit: "1개", // 영수증에서 단위 추출이 어려운 경우 기본값
            category: "사용자 등록",
          },
          select: { id: true },
        });
        productId = created.id;
        newProductsCreated++;
      }
      await tx.price.create({
        data: {
          productId,
          storeId,
          price: it.price,
          source: "receipt",
          contributorId: uploaderId,
          receiptId,
          ...(priceCreatedAt ? { createdAt: priceCreatedAt } : {}),
        },
      });
      pricesCreated++;
    }

    if (uploaderId) {
      // 신규 product 등록은 가산점 (매칭보다 더 가치 있음)
      const points = validMatched.length * 2 + newProductsCreated * 5;
      await tx.user.update({
        where: { id: uploaderId },
        data: { points: { increment: points } },
      });
    }
  });

  return NextResponse.json({
    ok: true,
    count: pricesCreated,
    matched: validMatched.length,
    newProducts: newProductsCreated,
    awarded: !!uploaderId,
  });
}
