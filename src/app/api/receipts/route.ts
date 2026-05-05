import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseReceipt, mergeReceipts, type OcrSource } from "@/lib/ocr";
import { matchProduct, matchStore } from "@/lib/matcher";
import { getCurrentUser } from "@/lib/supabase/server";
import { uploadReceiptImage } from "@/lib/storage";
import { lookupByBarcode, type FoodSafetyItem } from "@/lib/foodsafety";
import { matchBrand, generateAliasCandidates } from "@/lib/brandRules";

// Vercel 함수 timeout — OCR(CLOVA/Vision) + storage 업로드 + 매칭까지 60초 허용
export const maxDuration = 60;

// POST /api/receipts — 영수증 이미지 업로드 + OCR 파싱 + 자동 매칭 시도
// body: { imageBase64?: string }
// 로그인 사용자가 있으면 자동으로 contributor로 사용 (uploaderId 제거됨)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // 단일(imageBase64) + 다중(imagesBase64[]) 둘 다 지원 — 긴 영수증 이어찍기
  const imagesBase64: string[] = Array.isArray(body.imagesBase64)
    ? body.imagesBase64.filter((s: unknown) => typeof s === "string" && s)
    : body.imageBase64
      ? [body.imageBase64]
      : [];

  // 각 이미지 8MB 제한, 총 합 16MB 안전 한도
  for (const img of imagesBase64) {
    if (img.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "이미지 한 장 크기 초과 (8MB 제한)" }, { status: 413 });
    }
  }
  if (imagesBase64.reduce((s, x) => s + x.length, 0) > 16 * 1024 * 1024) {
    return NextResponse.json({ error: "총 이미지 크기 초과 (16MB)" }, { status: 413 });
  }

  const user = await getCurrentUser();
  const uploaderId = user?.id;

  let receipt;
  let usedMock = false;
  let source: OcrSource = "mock";
  try {
    if (imagesBase64.length === 0) {
      // demo flow (이미지 없음 → mock)
      const result = await parseReceipt(null);
      receipt = result.receipt;
      usedMock = result.usedMock;
      source = result.source;
    } else if (imagesBase64.length === 1) {
      const result = await parseReceipt(imagesBase64[0]);
      receipt = result.receipt;
      usedMock = result.usedMock;
      source = result.source;
    } else {
      // 다중 이미지 — 각각 OCR 후 merge (storeHint/날짜는 첫 매칭, items 합침+dedup)
      const results = await Promise.all(imagesBase64.map((img) => parseReceipt(img)));
      receipt = mergeReceipts(results.map((r) => r.receipt));
      // 하나라도 실제 OCR 성공이면 usedMock=false
      usedMock = results.every((r) => r.usedMock);
      source = results.find((r) => !r.usedMock)?.source ?? "mock";
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: msg,
        hint: "영수증을 더 밝은 곳에서 똑바로 찍거나, 글씨가 흐리지 않게 찍어주세요. 여러 장 찍었을 때는 한 장씩 다시 시도해보세요.",
      },
      { status: 502 }
    );
  }

  // 매장 추론 — 도로명+번지 우선, 그 다음 이름 부분 매칭, 마지막에 분점 번호 제거 매칭
  const storeId = await matchStore(receipt.storeHint, receipt.storeAddress);

  // Supabase Storage — 첫 번째 이미지만 대표로 저장 (영수증 record는 1개)
  const primaryImage = imagesBase64[0];
  let imageUrl = primaryImage ? "data:placeholder" : "mock://demo";
  let storagePath: string | undefined;
  if (primaryImage) {
    try {
      const isPng = primaryImage.startsWith("data:image/png") || primaryImage.includes("iVBORw0KGgo");
      const ext: "jpg" | "png" = isPng ? "png" : "jpg";
      const uploaded = await uploadReceiptImage(primaryImage, ext);
      imageUrl = uploaded.publicUrl;
      storagePath = uploaded.path;
    } catch (e) {
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

  // 각 품목을 카탈로그에 매칭 — 바코드 있으면 1순위 정확 매칭
  const matches = await Promise.all(
    receipt.items.map(async (it) => ({
      rawName: it.rawName,
      listPrice: it.listPrice,
      paidPrice: it.paidPrice ?? null,
      promotionType: it.promotionType ?? null,
      barcode: it.barcode ?? null,
      quantity: it.quantity,
      productId: await matchProduct(it.rawName, it.barcode),
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
      listPrice: number;                  // 정가 (정상가) — 필수
      paidPrice?: number | null;          // 행사/할인 적용 후 단가
      promotionType?: string | null;      // "할인" | "1+1" | "2+1" | "번들 50%" 등
      barcode?: string | null;            // EAN-8/12/13/14
      quantity: number;
      rawName?: string;                   // 신규 등록 시 product name으로 사용
      isNew?: boolean;                    // 신규 등록 의도
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
  //   - 기존 매칭: productId 있고 listPrice > 0
  //   - 신규 등록: isNew && rawName && listPrice > 0
  const validMatched = items.filter(
    (i) => i.productId && !i.isNew && i.listPrice > 0
  );
  const validNew = items.filter(
    (i) => i.isNew && i.rawName && i.rawName.trim() && i.listPrice > 0
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

  // 신규 product용 식약처 enrichment — 트랜잭션 전 병렬 fetch (트랜잭션 시간 보호)
  // 각 lookup 3초 timeout. 실패하면 null (영수증 OCR 이름 그대로 사용).
  // 같은 바코드 product가 이미 DB에 있으면 enrich 안 함 (트랜잭션 안에서 체크).
  const enrichmentMap = new Map<(typeof validNew)[number], FoodSafetyItem | null>();
  await Promise.all(
    validNew.map(async (it) => {
      const bc = it.barcode && /^\d{8,14}$/.test(it.barcode.trim()) ? it.barcode.trim() : null;
      if (!bc) return;
      try {
        const result = await Promise.race<FoodSafetyItem | null>([
          lookupByBarcode(bc),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);
        if (result) enrichmentMap.set(it, result);
      } catch {
        // 식약처 API 실패는 silent — 영수증 OCR 이름으로 fallback
      }
    }),
  );

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

    // 가격 데이터 빌더 — listPrice/paidPrice/promotionType
    const buildPriceData = (it: (typeof items)[number]) => ({
      listPrice: it.listPrice,
      paidPrice: it.paidPrice ?? null,
      promotionType: it.promotionType ?? null,
    });

    // 1) 기존 매칭 항목 → Price 추가
    for (const it of validMatched) {
      await tx.price.create({
        data: {
          productId: it.productId!,
          storeId,
          ...buildPriceData(it),
          source: "receipt",
          contributorId: uploaderId,
          receiptId,
          ...(priceCreatedAt ? { createdAt: priceCreatedAt } : {}),
        },
      });
      pricesCreated++;
    }

    // 2) 신규 등록 항목 → Product 생성 + Price 추가
    //    바코드 있는 신규 product는 식약처 C005/I2570 lookup으로 자동 enrich
    //    (정확한 이름/제조사/식품유형/카테고리/소비기한 자동 채움 — 사용자가 입력한 영수증 이름은 OCR 오류 多)
    //
    // enrichment는 트랜잭션 시간 보호를 위해 트랜잭션 밖에서 미리 fetch.
    // 각 lookup 3초 timeout, 병렬.
    for (const it of validNew) {
      const cleanName = (it.rawName ?? "").trim().slice(0, 200);
      const cleanBarcode =
        it.barcode && /^\d{8,14}$/.test(it.barcode.trim()) ? it.barcode.trim() : null;
      // 바코드 우선 매칭 (영수증의 EAN과 같은 상품을 다른 사용자가 이미 등록한 경우)
      let productId: string | null = null;
      if (cleanBarcode) {
        const byBarcode = await tx.product.findUnique({
          where: { barcode: cleanBarcode },
          select: { id: true },
        });
        if (byBarcode) productId = byBarcode.id;
      }
      // 그 다음 같은 이름 중복 방지
      if (!productId) {
        const existing = await tx.product.findFirst({
          where: { name: cleanName },
          select: { id: true },
        });
        if (existing) productId = existing.id;
      }
      if (!productId) {
        // 식약처 enrich — 바코드 있을 때만 lookup
        // brand 사전 매칭 — enriched 없거나 누락 필드 보강 (cron 안 기다리고 즉시)
        // 매칭 실패해도 기본값으로 fallback (영수증 OCR 이름 그대로)
        const enriched = enrichmentMap.get(it) ?? null;
        const finalName = enriched?.productName?.trim() || cleanName;
        const brandMatch = matchBrand(finalName);

        const productData = {
          name: finalName,
          // 식약처가 brand는 안 줌 → brand 사전 결과만 적용
          brand: brandMatch?.brand ?? null,
          // 식약처 lookup이 우선, 없으면 brand 사전 fallback
          manufacturer: enriched?.manufacturer?.trim() || brandMatch?.manufacturer || null,
          origin: brandMatch?.origin ?? null,
          unit: "1개",
          // 카테고리 우선순위: 식약처 minor → 식약처 foodType → brand 사전 → "사용자 등록"
          category:
            enriched?.category?.minor ||
            enriched?.foodType ||
            brandMatch?.category ||
            "사용자 등록",
          barcode: cleanBarcode,
          // metadata에 식약처 정보 보존 (소비기한/주소/카테고리 트리/식품유형)
          metadata: enriched
            ? ({
                foodsafety: {
                  productName: enriched.productName,
                  manufacturer: enriched.manufacturer,
                  foodType: enriched.foodType,
                  category: enriched.category,
                  shelfLife: enriched.shelfLife,
                  manufacturerAddress: enriched.manufacturerAddress,
                  reportNo: enriched.reportNo,
                  industry: enriched.industry,
                },
              } as never)
            : undefined,
        };
        const created = await tx.product.create({
          data: productData,
          select: { id: true },
        });
        productId = created.id;
        newProductsCreated++;

        // alias 자동 생성 — 다음 영수증 OCR 매칭률 향상
        // (예: "CJ 햇반 백미밥" 외에 "햇반 백미밥", "햇반"도 alias 등록)
        const aliasCandidates = generateAliasCandidates(
          productData.name,
          productData.brand,
        );
        for (const alias of aliasCandidates) {
          try {
            await tx.productAlias.create({
              data: { productId: created.id, alias },
            });
          } catch {
            // ProductAlias.alias @@unique 충돌 — silent skip (이미 다른 product 사용 중)
          }
        }
      }
      await tx.price.create({
        data: {
          productId,
          storeId,
          ...buildPriceData(it),
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
