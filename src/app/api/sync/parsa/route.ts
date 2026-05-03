// POST /api/sync/parsa — 한국소비자원 참가격(parsa) 동기화 (검증용 stub)
//
// 현재 라운드는 스키마 변경 없이 응답 데이터 형태만 echo back 한다.
// (다른 에이전트가 prisma generate / vercel.json을 동시에 수정 중이라
// 충돌을 피하기 위해 영구 저장은 다음 라운드에서 진행.)
//
// Query params:
//   ?type=stores   — 매장만 가져오기
//   ?type=products — 상품만 가져오기
//   ?type=both     — 둘 다 (기본값)
//   ?numOfRows=N   — 페이지 크기 (기본 200, 최대 500)

import { NextRequest, NextResponse } from "next/server";
import { checkSyncAuth } from "@/lib/auth";
import {
  fetchParsaStoresPage,
  fetchParsaProductsPage,
  type ParsaStore,
  type ParsaProduct,
} from "@/lib/parsa";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();

  const url = new URL(req.url);
  const type = (url.searchParams.get("type") ?? "both").toLowerCase();
  const rawRows = parseInt(url.searchParams.get("numOfRows") ?? "200", 10);
  const numOfRows =
    Number.isFinite(rawRows) && rawRows > 0 ? Math.min(rawRows, 500) : 200;

  let stores: ParsaStore[] = [];
  let products: ParsaProduct[] = [];
  const errors: Record<string, string> = {};

  if (type === "stores" || type === "both") {
    const r = await fetchParsaStoresPage(1, numOfRows);
    stores = r.rows;
    if (r.error) errors.stores = r.error;
  }

  if (type === "products" || type === "both") {
    const r = await fetchParsaProductsPage(1, numOfRows);
    products = r.rows;
    if (r.error) errors.products = r.error;
  }

  const elapsedMs = Date.now() - startedAt;

  return NextResponse.json({
    ok: stores.length > 0 || products.length > 0,
    type,
    numOfRows,
    storesCount: stores.length,
    productsCount: products.length,
    // 응답 크기 제한을 위해 처음 5건만 샘플로 echo. 전체 카운트는 위 storesCount/productsCount 참고.
    sampleStores: stores.slice(0, 5),
    sampleProducts: products.slice(0, 5),
    elapsedMs,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    note:
      "검증 stub — 영구 저장 미구현. 데이터 형태 확인 후 다음 라운드에 Prisma 모델 추가 예정.",
  });
}
