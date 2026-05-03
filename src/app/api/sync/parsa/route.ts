// POST /api/sync/parsa — 한국소비자원 참가격(parsa) 동기화
//
// entpId(매장) / goodId(상품) 기준 upsert. Vercel Cron(매주 토요일 18시) 또는 X-Sync-Token 인증.
// 참가격 갱신 주기: 매주 금요일 → 토요일 18시(KST)에 cron 실행 (1일 버퍼).
//
// 데이터 규모: 매장 ~615건, 상품 ~604건 — 모두 1 페이지(numOfRows=1000)에 들어감.
//
// Query params:
//   ?type=stores     — 매장만
//   ?type=products   — 상품만
//   ?type=both       — 매장+상품 (기본값)
//   ?type=standard   — 표준코드 (AL/BU/AR/UT) — alias: categories
//   ?type=prices     — 가격(getProductPriceInfoSvc) — 매장별 615회 호출, partial-resume 지원
//   ?from=N          — (prices 전용) entpId 배열 N번 인덱스부터 이어받기
//   ?updates=true    — 기존 row도 update (기본 false: createMany only — 빠름)
//   ?numOfRows=N     — 페이지 크기 (기본 1000, 최대 1000)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import {
  fetchParsaStoresPage,
  fetchParsaProductsPage,
  fetchParsaStandardPage,
  fetchParsaPriceByStore,
  findLatestParsaInspectDay,
  type ParsaStore as ParsaStoreRow,
  type ParsaProduct as ParsaProductRow,
  type ParsaStandardItem as ParsaStandardRow,
  type ParsaPriceItem,
} from "@/lib/parsa";

export const maxDuration = 60;

type SectionResult = {
  fetched: number;
  inserted: number;
  updated: number;
  error?: string;
};

// 매장 동기화: entpId 기준 upsert.
async function syncStores(
  numOfRows: number,
  enableUpdates: boolean
): Promise<SectionResult> {
  const r = await fetchParsaStoresPage(1, numOfRows);
  if (r.error && r.rows.length === 0) {
    return { fetched: 0, inserted: 0, updated: 0, error: r.error };
  }

  // 페이지 내 entpId 중복 제거
  const seen = new Set<string>();
  const dedup: ParsaStoreRow[] = [];
  for (const row of r.rows) {
    if (seen.has(row.entpId)) continue;
    seen.add(row.entpId);
    dedup.push(row);
  }

  const fetched = dedup.length;
  let inserted = 0;
  let updated = 0;
  let error: string | undefined = r.error;

  // 1) createMany(skipDuplicates) — 신규만 빠르게 삽입
  const createData = dedup.map((s) => ({
    entpId: s.entpId,
    entpName: s.entpName,
    entpTypeCode: s.entpTypeCode,
    entpAreaCode: s.entpAreaCode,
    areaDetailCode: s.areaDetailCode,
    entpTelno: s.entpTelno,
    postNo: s.postNo,
    addrBasic: s.addrBasic,
    addrDetail: s.addrDetail,
    roadAddrBasic: s.roadAddrBasic,
  }));

  let insertedThisPage = 0;
  try {
    const res = await prisma.parsaStore.createMany({
      data: createData,
      skipDuplicates: true,
    });
    insertedThisPage = res.count;
    inserted += insertedThisPage;
  } catch (e) {
    error = `parsaStore.createMany 실패: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 2) ?updates=true 시에만 기존 row update (50개씩 병렬화)
  if (enableUpdates && insertedThisPage < dedup.length) {
    try {
      const CHUNK = 50;
      for (let i = 0; i < dedup.length; i += CHUNK) {
        const slice = dedup.slice(i, i + CHUNK);
        await Promise.all(
          slice.map((s) =>
            prisma.parsaStore.updateMany({
              where: { entpId: s.entpId },
              data: {
                entpName: s.entpName,
                entpTypeCode: s.entpTypeCode,
                entpAreaCode: s.entpAreaCode,
                areaDetailCode: s.areaDetailCode,
                entpTelno: s.entpTelno,
                postNo: s.postNo,
                addrBasic: s.addrBasic,
                addrDetail: s.addrDetail,
                roadAddrBasic: s.roadAddrBasic,
              },
            })
          )
        );
      }
      updated += dedup.length - insertedThisPage;
    } catch (e) {
      error = `parsaStore.update 실패: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return { fetched, inserted, updated, error };
}

// 상품 동기화: goodId 기준 upsert.
async function syncProducts(
  numOfRows: number,
  enableUpdates: boolean
): Promise<SectionResult> {
  const r = await fetchParsaProductsPage(1, numOfRows);
  if (r.error && r.rows.length === 0) {
    return { fetched: 0, inserted: 0, updated: 0, error: r.error };
  }

  // 페이지 내 goodId 중복 제거
  const seen = new Set<string>();
  const dedup: ParsaProductRow[] = [];
  for (const row of r.rows) {
    if (seen.has(row.goodId)) continue;
    seen.add(row.goodId);
    dedup.push(row);
  }

  const fetched = dedup.length;
  let inserted = 0;
  let updated = 0;
  let error: string | undefined = r.error;

  // 1) createMany(skipDuplicates) — 신규만
  const createData = dedup.map((p) => ({
    goodId: p.goodId,
    goodName: p.goodName,
    productEntpCode: p.productEntpCode,
    goodUnitDivCode: p.goodUnitDivCode,
    goodBaseCnt: p.goodBaseCnt,
    goodSmlclsCode: p.goodSmlclsCode,
    goodTotalCnt: p.goodTotalCnt,
    goodTotalDivCode: p.goodTotalDivCode,
    detailMean: p.detailMean,
  }));

  let insertedThisPage = 0;
  try {
    const res = await prisma.parsaProduct.createMany({
      data: createData,
      skipDuplicates: true,
    });
    insertedThisPage = res.count;
    inserted += insertedThisPage;
  } catch (e) {
    error = `parsaProduct.createMany 실패: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 2) ?updates=true 시에만 기존 row update
  if (enableUpdates && insertedThisPage < dedup.length) {
    try {
      const CHUNK = 50;
      for (let i = 0; i < dedup.length; i += CHUNK) {
        const slice = dedup.slice(i, i + CHUNK);
        await Promise.all(
          slice.map((p) =>
            prisma.parsaProduct.updateMany({
              where: { goodId: p.goodId },
              data: {
                goodName: p.goodName,
                productEntpCode: p.productEntpCode,
                goodUnitDivCode: p.goodUnitDivCode,
                goodBaseCnt: p.goodBaseCnt,
                goodSmlclsCode: p.goodSmlclsCode,
                goodTotalCnt: p.goodTotalCnt,
                goodTotalDivCode: p.goodTotalDivCode,
                detailMean: p.detailMean,
              },
            })
          )
        );
      }
      updated += dedup.length - insertedThisPage;
    } catch (e) {
      error = `parsaProduct.update 실패: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return { fetched, inserted, updated, error };
}

// 표준코드 동기화: classCode + code 복합키 기준 upsert.
// AL(소분류), BU(업태), AR(지역), UT(단위/용량) 4개 classCode를 모두 순회.
async function syncCategories(
  numOfRows: number,
  enableUpdates: boolean
): Promise<SectionResult> {
  const classCodes: Array<"AL" | "BU" | "AR" | "UT"> = ["AL", "BU", "AR", "UT"];
  const allRows: ParsaStandardRow[] = [];
  const errors: string[] = [];

  for (const cc of classCodes) {
    const r = await fetchParsaStandardPage(cc, numOfRows);
    if (r.error) errors.push(`[${cc}] ${r.error}`);
    for (const row of r.rows) allRows.push(row);
  }

  if (allRows.length === 0) {
    return {
      fetched: 0,
      inserted: 0,
      updated: 0,
      error: errors.join(" | ") || undefined,
    };
  }

  // (classCode, code) 복합 unique 기준 dedup
  const seen = new Set<string>();
  const dedup: ParsaStandardRow[] = [];
  for (const row of allRows) {
    const k = `${row.classCode}::${row.code}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(row);
  }

  const fetched = dedup.length;
  let inserted = 0;
  let updated = 0;
  let error: string | undefined = errors.length ? errors.join(" | ") : undefined;

  // 1) createMany(skipDuplicates) — 신규만 빠르게 삽입
  const createData = dedup.map((c) => ({
    classCode: c.classCode,
    code: c.code,
    codeName: c.codeName,
    highCode: c.highCode,
  }));

  let insertedThisPage = 0;
  try {
    const res = await prisma.parsaCategory.createMany({
      data: createData,
      skipDuplicates: true,
    });
    insertedThisPage = res.count;
    inserted += insertedThisPage;
  } catch (e) {
    error = `parsaCategory.createMany 실패: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 2) ?updates=true 시에만 기존 row update (50개 병렬 chunk)
  if (enableUpdates && insertedThisPage < dedup.length) {
    try {
      const CHUNK = 50;
      for (let i = 0; i < dedup.length; i += CHUNK) {
        const slice = dedup.slice(i, i + CHUNK);
        await Promise.all(
          slice.map((c) =>
            prisma.parsaCategory.updateMany({
              where: { classCode: c.classCode, code: c.code },
              data: {
                codeName: c.codeName,
                highCode: c.highCode,
              },
            })
          )
        );
      }
      updated += dedup.length - insertedThisPage;
    } catch (e) {
      error = `parsaCategory.update 실패: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return { fetched, inserted, updated, error };
}

// 가격 동기화 결과 타입 (다른 type과 응답 형태가 다름 — partial-resume 필요).
type PriceSyncResult = {
  ok: boolean;
  inspectDay: string | null;
  storesProcessed: number;
  pricesInserted: number;
  pricesUpdated: number;
  partial: boolean;
  processedThrough: number;
  totalStores: number;
  elapsedMs: number;
  error?: string;
};

// 가격 동기화: latest inspectDay 결정 → 모든 ParsaStore.entpId 순회 → 매장별 가격 fetch → bulk upsert.
// time-budget 내에 끝나지 않으면 partial=true로 returnsd 후 ?from=N 로 이어받기.
async function syncPrices(
  startedAt: number,
  startFrom: number,
  enableUpdates: boolean
): Promise<PriceSyncResult> {
  const TIME_BUDGET_MS = 50_000;

  // 1) latest inspectDay
  const inspectDay = await findLatestParsaInspectDay();
  if (!inspectDay) {
    return {
      ok: false,
      inspectDay: null,
      storesProcessed: 0,
      pricesInserted: 0,
      pricesUpdated: 0,
      partial: false,
      processedThrough: startFrom - 1,
      totalStores: 0,
      elapsedMs: Date.now() - startedAt,
      error: "최근 inspectDay 후보 모두 빈 응답 — 데이터 없음",
    };
  }

  // 2) ParsaStore 목록
  const storeRows = await prisma.parsaStore.findMany({
    select: { entpId: true },
    orderBy: { entpId: "asc" },
  });
  const entpIds = storeRows.map((s) => s.entpId);
  const totalStores = entpIds.length;

  if (totalStores === 0) {
    return {
      ok: false,
      inspectDay,
      storesProcessed: 0,
      pricesInserted: 0,
      pricesUpdated: 0,
      partial: false,
      processedThrough: startFrom - 1,
      totalStores: 0,
      elapsedMs: Date.now() - startedAt,
      error: "ParsaStore 비어있음 — stores 먼저 sync 필요",
    };
  }

  // 3) 매장 순회
  let storesProcessed = 0;
  let pricesInserted = 0;
  let pricesUpdated = 0;
  let partial = false;
  let processedThrough = Math.max(0, startFrom) - 1;
  let lastError: string | undefined;

  // 매장 단위로 fetch한 rows를 모아서 chunk 단위 upsert.
  // 한 매장당 평균 ~50 row × 615 stores = 30k row → 메모리 안전, 그러나 DB는 chunk(1k)로 나눠 보냄.
  let buffer: ParsaPriceItem[] = [];
  const FLUSH_THRESHOLD = 500; // 500 row 모이면 flush

  const flush = async () => {
    if (buffer.length === 0) return;
    // (entpId, goodId, inspectDay) 복합키 dedup (드물지만 안전을 위해)
    const seen = new Set<string>();
    const dedup: ParsaPriceItem[] = [];
    for (const r of buffer) {
      const k = `${r.entpId}::${r.goodId}::${r.inspectDay}`;
      if (seen.has(k)) continue;
      seen.add(k);
      dedup.push(r);
    }

    // 1) createMany(skipDuplicates) — 신규만
    const createData = dedup.map((p) => ({
      entpId: p.entpId,
      goodId: p.goodId,
      inspectDay: p.inspectDay,
      price: p.price,
      plusoneYn: p.plusoneYn,
      discountYn: p.discountYn,
      discountStart: p.discountStart,
      discountEnd: p.discountEnd,
      inputDttm: p.inputDttm,
    }));

    let insertedThisFlush = 0;
    try {
      const res = await prisma.parsaPrice.createMany({
        data: createData,
        skipDuplicates: true,
      });
      insertedThisFlush = res.count;
      pricesInserted += insertedThisFlush;
    } catch (e) {
      lastError = `parsaPrice.createMany 실패: ${e instanceof Error ? e.message : String(e)}`;
    }

    // 2) updates=true 시 기존 row update (50개 병렬 chunk).
    //    가격은 매주 갱신이라 update가 핵심 — 그러나 cron 환경에선 createMany만으로도
    //    같은 inspectDay는 dedup되고, 새 inspectDay면 모두 신규 row가 됨.
    if (enableUpdates && insertedThisFlush < dedup.length) {
      try {
        const CHUNK = 50;
        for (let i = 0; i < dedup.length; i += CHUNK) {
          const slice = dedup.slice(i, i + CHUNK);
          await Promise.all(
            slice.map((p) =>
              prisma.parsaPrice.updateMany({
                where: {
                  entpId: p.entpId,
                  goodId: p.goodId,
                  inspectDay: p.inspectDay,
                },
                data: {
                  price: p.price,
                  plusoneYn: p.plusoneYn,
                  discountYn: p.discountYn,
                  discountStart: p.discountStart,
                  discountEnd: p.discountEnd,
                  inputDttm: p.inputDttm,
                },
              })
            )
          );
        }
        pricesUpdated += dedup.length - insertedThisFlush;
      } catch (e) {
        lastError = `parsaPrice.update 실패: ${e instanceof Error ? e.message : String(e)}`;
      }
    }

    buffer = [];
  };

  for (let i = startFrom; i < totalStores; i++) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      partial = true;
      break;
    }

    const entpId = entpIds[i];
    const r = await fetchParsaPriceByStore(entpId, inspectDay);
    if (r.error && r.rows.length === 0) {
      lastError = `[entpId=${entpId}] ${r.error}`;
      // 한 매장 실패라도 다음으로 진행
    }
    if (r.rows.length > 0) {
      buffer.push(...r.rows);
    }
    storesProcessed += 1;
    processedThrough = i;

    // buffer 임계치 초과 시 flush
    if (buffer.length >= FLUSH_THRESHOLD) {
      await flush();
    }

    // 30 TPS 보호 (35ms = ~28 TPS)
    await new Promise((r) => setTimeout(r, 35));
  }

  // 남은 buffer flush
  await flush();

  return {
    ok: !lastError || storesProcessed > 0,
    inspectDay,
    storesProcessed,
    pricesInserted,
    pricesUpdated,
    partial,
    processedThrough,
    totalStores,
    elapsedMs: Date.now() - startedAt,
    error: lastError,
  };
}

export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();

  const url = new URL(req.url);
  const type = (url.searchParams.get("type") ?? "both").toLowerCase();
  const enableUpdates = url.searchParams.get("updates") === "true";
  const rawRows = parseInt(url.searchParams.get("numOfRows") ?? "1000", 10);
  const numOfRows =
    Number.isFinite(rawRows) && rawRows > 0 ? Math.min(rawRows, 1000) : 1000;

  // ?type=prices — 별도 응답 스키마 (partial-resume 지원).
  if (type === "prices") {
    const fromParam = parseInt(url.searchParams.get("from") ?? "0", 10);
    const startFrom = Number.isFinite(fromParam) && fromParam > 0 ? fromParam : 0;
    const result = await syncPrices(startedAt, startFrom, enableUpdates);
    return NextResponse.json(result);
  }

  let stores: SectionResult = { fetched: 0, inserted: 0, updated: 0 };
  let products: SectionResult = { fetched: 0, inserted: 0, updated: 0 };
  let categories: SectionResult = { fetched: 0, inserted: 0, updated: 0 };

  if (type === "stores" || type === "both") {
    stores = await syncStores(numOfRows, enableUpdates);
  }
  if (type === "products" || type === "both") {
    products = await syncProducts(numOfRows, enableUpdates);
  }
  // standard / categories — 표준코드(AL/BU/AR/UT) 동기화. both에는 미포함(독립 운영).
  if (type === "standard" || type === "categories") {
    categories = await syncCategories(numOfRows, enableUpdates);
  }

  const elapsedMs = Date.now() - startedAt;
  const ok =
    type === "stores"
      ? !stores.error || stores.fetched > 0
      : type === "products"
      ? !products.error || products.fetched > 0
      : type === "standard" || type === "categories"
      ? !categories.error || categories.fetched > 0
      : (!stores.error || stores.fetched > 0) &&
        (!products.error || products.fetched > 0);

  return NextResponse.json({
    ok,
    type,
    numOfRows,
    enableUpdates,
    stores,
    products,
    categories,
    elapsedMs,
  });
}
