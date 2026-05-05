// POST /api/sync/parsa/full-mirror — ParsaProduct → Product, ParsaPrice → Price 미러링
//
// 한국소비자원 참가격 데이터(ParsaProduct, ParsaPrice)를 우리 일반 Product/Price 테이블에
// 미러링해서 검색/상세/메인에 자연스럽게 노출.
// Store 미러는 /api/sync/parsa/mirror 가 담당 — 이 라우트는 Product/Price만 처리.
//
// 인증: checkSyncAuth (X-Sync-Token 또는 사이트 내부 호출)
// 멱등성:
//   - Product.externalId = "parsa:product:{goodId}" 기준 upsert
//   - Price는 source="parsa" 전체를 deleteMany 후 createMany (재실행 시 데이터 정합성 OK)
//
// 쿼리:
//   ?type=products|prices|both (default both)
//   ?from=N (prices 모드 partial-resume offset, default 0)
//   ?limit=N (prices 모드 한 번에 처리할 row 수, default 10000)
//
// 응답: { ok, type, totalParsaProducts?, productsCreated?, productsUpdated?,
//         totalParsaPrices?, pricesDeleted?, pricesCreated?, pricesSkipped?,
//         partial?, processedThrough?, elapsedMs }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";

export const maxDuration = 60;

// 1차 미러는 카테고리를 단순 고정값으로 — 향후 ParsaCategory(AL)로 매핑 가능.
const MIRROR_CATEGORY = "참가격 등록 상품";
const PRICE_SOURCE = "parsa";

// ───────────────────────────────────────────────────────────
// products 미러
// ───────────────────────────────────────────────────────────
async function mirrorProducts() {
  // 1) ParsaProduct 전체 조회
  const parsaProducts = await prisma.parsaProduct.findMany({
    select: {
      goodId: true,
      goodName: true,
      goodTotalCnt: true,
      goodTotalDivCode: true,
    },
    orderBy: { goodId: "asc" },
  });
  const totalParsaProducts = parsaProducts.length;

  if (totalParsaProducts === 0) {
    return {
      totalParsaProducts: 0,
      productsCreated: 0,
      productsUpdated: 0,
      error: "ParsaProduct 비어있음 — /api/sync/parsa?type=products 먼저 실행 필요",
    };
  }

  // 2) 미러 데이터 매핑
  type MirrorProduct = {
    externalId: string;
    name: string;
    category: string;
    unit: string;
    brand: string | null;
  };
  const mirrorRows: MirrorProduct[] = parsaProducts.map((p) => {
    // unit = goodTotalCnt + goodTotalDivCode 조합 (예: "210" + "G" = "210G")
    // 둘 다 null이면 빈 문자열
    const cnt = (p.goodTotalCnt ?? "").trim();
    const div = (p.goodTotalDivCode ?? "").trim();
    const unit = cnt || div ? `${cnt}${div}` : "";
    return {
      externalId: `parsa:product:${p.goodId}`,
      name: p.goodName,
      category: MIRROR_CATEGORY,
      unit,
      brand: null, // 참가격 응답엔 brand 정보 없음
    };
  });

  // 3) 기존 Product 조회 (externalId 기준)
  const externalIds = mirrorRows.map((r) => r.externalId);
  const existing = await prisma.product.findMany({
    where: { externalId: { in: externalIds } },
    select: { externalId: true },
  });
  const existingSet = new Set(
    existing.map((e) => e.externalId).filter((x): x is string => Boolean(x))
  );

  const toInsert = mirrorRows.filter((r) => !existingSet.has(r.externalId));
  const toUpdate = mirrorRows.filter((r) => existingSet.has(r.externalId));

  // 4) 신규 createMany — 빠른 일괄 삽입
  let productsCreated = 0;
  if (toInsert.length > 0) {
    const res = await prisma.product.createMany({
      data: toInsert,
      skipDuplicates: true,
    });
    productsCreated = res.count;
  }

  // 5) 기존 row update — 50개 병렬 chunk
  let productsUpdated = 0;
  if (toUpdate.length > 0) {
    const CHUNK = 50;
    for (let i = 0; i < toUpdate.length; i += CHUNK) {
      const slice = toUpdate.slice(i, i + CHUNK);
      const results = await Promise.all(
        slice.map((r) =>
          prisma.product.updateMany({
            where: { externalId: r.externalId },
            data: {
              name: r.name,
              category: r.category,
              unit: r.unit,
              brand: r.brand,
            },
          })
        )
      );
      for (const u of results) productsUpdated += u.count;
    }
  }

  return { totalParsaProducts, productsCreated, productsUpdated };
}

// ───────────────────────────────────────────────────────────
// prices 미러 — partial-resume 지원
// ───────────────────────────────────────────────────────────
async function mirrorPrices(from: number, limit: number) {
  // 1) 가장 최신 inspectDay 결정 (분포 기준 1개)
  const latestRow = await prisma.parsaPrice.findFirst({
    select: { inspectDay: true },
    orderBy: { inspectDay: "desc" },
  });
  if (!latestRow) {
    return {
      totalParsaPrices: 0,
      pricesDeleted: 0,
      pricesCreated: 0,
      pricesSkipped: 0,
      partial: false,
      processedThrough: from,
      error: "ParsaPrice 비어있음 — /api/sync/parsa?type=prices 먼저 실행 필요",
    };
  }
  const latestDay = latestRow.inspectDay;

  // 2) 전체 카운트 (총량 + partial 판단용)
  const totalParsaPrices = await prisma.parsaPrice.count({
    where: { inspectDay: latestDay },
  });

  // 3) 첫 호출(from === 0)에서만 source="parsa" 기존 row 일괄 삭제
  //    — 이후 partial-resume 호출에서는 누적 삽입.
  let pricesDeleted = 0;
  if (from === 0) {
    const delRes = await prisma.price.deleteMany({
      where: { source: PRICE_SOURCE },
    });
    pricesDeleted = delRes.count;
  }

  // 4) 이번 chunk 만큼 ParsaPrice 가져오기
  const chunk = await prisma.parsaPrice.findMany({
    where: { inspectDay: latestDay },
    orderBy: { id: "asc" },
    skip: from,
    take: limit,
  });

  if (chunk.length === 0) {
    return {
      totalParsaPrices,
      pricesDeleted,
      pricesCreated: 0,
      pricesSkipped: 0,
      partial: false,
      processedThrough: from,
    };
  }

  // 5) 매핑용 룩업 테이블 — chunk에 등장하는 goodId/entpId만
  const goodIds = Array.from(new Set(chunk.map((p) => p.goodId)));
  const entpIds = Array.from(new Set(chunk.map((p) => p.entpId)));
  const productExtIds = goodIds.map((g) => `parsa:product:${g}`);
  const storeExtIds = entpIds.map((e) => `parsa:${e}`);

  const [productsLookup, storesLookup] = await Promise.all([
    prisma.product.findMany({
      where: { externalId: { in: productExtIds } },
      select: { id: true, externalId: true },
    }),
    prisma.store.findMany({
      where: { externalId: { in: storeExtIds } },
      select: { id: true, externalId: true },
    }),
  ]);
  const productMap = new Map<string, string>();
  for (const p of productsLookup) {
    if (p.externalId) productMap.set(p.externalId, p.id);
  }
  const storeMap = new Map<string, string>();
  for (const s of storesLookup) {
    if (s.externalId) storeMap.set(s.externalId, s.id);
  }

  // 6) Price row 생성 — listPrice/paidPrice/promotionType 채움
  // parsa 데이터: discountYn=true면 할인 적용가, plusoneYn=true면 1+1 행사
  // 우선순위: 1+1 > 할인 (둘 다 true면 1+1로 표시)
  type PriceRow = {
    productId: string;
    storeId: string;
    listPrice: number;
    paidPrice: number | null;
    promotionType: string | null;
    source: string;
    productUrl: string | null;
  };
  const priceRows: PriceRow[] = [];
  let pricesSkipped = 0;
  for (const p of chunk) {
    const productId = productMap.get(`parsa:product:${p.goodId}`);
    const storeId = storeMap.get(`parsa:${p.entpId}`);
    if (!productId || !storeId) {
      pricesSkipped += 1;
      continue;
    }
    const promotionType = p.plusoneYn ? "1+1" : p.discountYn ? "할인" : null;
    const onSale = p.discountYn || p.plusoneYn;
    priceRows.push({
      productId,
      storeId,
      listPrice: p.price,
      paidPrice: onSale ? p.price : null, // parsa는 조사가가 곧 할인 적용가 → paidPrice도 동일
      promotionType,
      source: PRICE_SOURCE,
      productUrl: null,
    });
  }

  // 7) createMany 일괄 삽입
  let pricesCreated = 0;
  if (priceRows.length > 0) {
    const res = await prisma.price.createMany({
      data: priceRows,
      skipDuplicates: true,
    });
    pricesCreated = res.count;
  }

  const processedThrough = from + chunk.length;
  const partial = processedThrough < totalParsaPrices;

  return {
    totalParsaPrices,
    pricesDeleted,
    pricesCreated,
    pricesSkipped,
    partial,
    processedThrough,
  };
}

// ───────────────────────────────────────────────────────────
// POST handler
// ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") ?? "both").toLowerCase();
  const from = Math.max(0, parseInt(url.searchParams.get("from") ?? "0", 10) || 0);
  const limit = Math.min(
    50000,
    Math.max(100, parseInt(url.searchParams.get("limit") ?? "10000", 10) || 10000)
  );
  // chain=true 면 partial 시 다음 chunk를 self-trigger (cron 1번으로 13회 자동 처리용)
  const chain = url.searchParams.get("chain") === "true";

  // 같은 host로 self-trigger fetch (await 안 함 — fire-and-forget)
  function selfTriggerNext(nextFrom: number) {
    const host = req.headers.get("host");
    if (!host) return;
    const proto = host.startsWith("localhost") ? "http" : "https";
    const nextUrl = `${proto}://${host}/api/sync/parsa/full-mirror?type=prices&from=${nextFrom}&limit=${limit}&chain=true`;
    void fetch(nextUrl, {
      method: "POST",
      headers: { "X-Sync-Token": process.env.SYNC_TOKEN || "" },
    }).catch(() => {});
  }

  if (type !== "products" && type !== "prices" && type !== "both") {
    return NextResponse.json(
      {
        ok: false,
        error: "type은 products|prices|both 중 하나",
      },
      { status: 400 }
    );
  }

  // products 단독 또는 both
  if (type === "products") {
    const r = await mirrorProducts();
    return NextResponse.json({
      ok: true,
      type,
      ...r,
      elapsedMs: Date.now() - startedAt,
    });
  }

  // prices 단독
  if (type === "prices") {
    const r = await mirrorPrices(from, limit);
    // chain=true 이고 partial이면 다음 chunk 자동 호출
    if (chain && r.partial) selfTriggerNext(r.processedThrough);
    return NextResponse.json({
      ok: true,
      type,
      chain,
      ...r,
      elapsedMs: Date.now() - startedAt,
    });
  }

  // both — products 먼저, 그 다음 prices (partial-resume 시작)
  const productsResult = await mirrorProducts();
  const pricesResult = await mirrorPrices(from, limit);
  return NextResponse.json({
    ok: true,
    type,
    ...productsResult,
    ...pricesResult,
    elapsedMs: Date.now() - startedAt,
  });
}
