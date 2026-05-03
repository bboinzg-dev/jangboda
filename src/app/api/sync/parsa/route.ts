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
//   ?type=both       — 둘 다 (기본값)
//   ?updates=true    — 기존 row도 update (기본 false: createMany only — 빠름)
//   ?numOfRows=N     — 페이지 크기 (기본 1000, 최대 1000)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import {
  fetchParsaStoresPage,
  fetchParsaProductsPage,
  type ParsaStore as ParsaStoreRow,
  type ParsaProduct as ParsaProductRow,
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

  let stores: SectionResult = { fetched: 0, inserted: 0, updated: 0 };
  let products: SectionResult = { fetched: 0, inserted: 0, updated: 0 };

  if (type === "stores" || type === "both") {
    stores = await syncStores(numOfRows, enableUpdates);
  }
  if (type === "products" || type === "both") {
    products = await syncProducts(numOfRows, enableUpdates);
  }

  const elapsedMs = Date.now() - startedAt;
  const ok =
    (type === "stores"
      ? !stores.error || stores.fetched > 0
      : type === "products"
      ? !products.error || products.fetched > 0
      : (!stores.error || stores.fetched > 0) &&
        (!products.error || products.fetched > 0));

  return NextResponse.json({
    ok,
    type,
    numOfRows,
    enableUpdates,
    stores,
    products,
    elapsedMs,
  });
}
