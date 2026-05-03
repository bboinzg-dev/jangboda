// 통계청 온라인 수집 가격 정보 → 우리 카탈로그 매칭 + Price 추가
//
// 흐름:
//   1) listItems()로 70+개 식품 카테고리 받기
//   2) 각 카테고리별 D-2 ~ D-3일 가격 데이터 (수천 건/카테고리)
//   3) productName(pn)을 우리 Product와 token-match
//   4) 매칭되면 source="stats_official" Price 추가 (chain="통계청 시세")
//
// chain self-trigger: ?chain=true&from=N (다음 카테고리 인덱스부터)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSyncAuth } from "@/lib/auth";
import { listItems, getPrices, findLatestDataDate } from "@/lib/stats";

export const maxDuration = 60;

// 통계청 시세 chain + 가상 store (1개로 모든 통계청 가격 등록)
async function ensureStatsStore() {
  const chain = await prisma.chain.upsert({
    where: { name: "통계청 시세" },
    update: {},
    create: { name: "통계청 시세", category: "public" },
  });
  const existing = await prisma.store.findFirst({
    where: { chainId: chain.id, name: "통계청 온라인 평균" },
  });
  if (existing) return existing;
  return prisma.store.create({
    data: {
      chainId: chain.id,
      name: "통계청 온라인 평균",
      address: "온라인 (정부 수집)",
      lat: 0,
      lng: 0,
      hours: "—",
    },
  });
}

function tokenize(s: string): string[] {
  return s
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^가-힣a-zA-Z0-9]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
}

// row.productName(pn)이 우리 Product와 매칭되는지
// 우리 product의 핵심 토큰 ≥2개가 pn에 포함되어야
function matchProductToRow(
  productName: string,
  brand: string | null,
  pn: string
): boolean {
  const productTokens = tokenize(productName);
  if (brand) productTokens.push(...tokenize(brand));
  const unique = Array.from(new Set(productTokens));
  if (unique.length === 0) return false;

  const pnLower = pn.toLowerCase();
  const hits = unique.filter((t) => pnLower.includes(t.toLowerCase())).length;
  // 토큰 1개면 정확히 1개 매칭, 2개 이상이면 ≥2개
  const required = unique.length === 1 ? 1 : 2;
  return hits >= required;
}

export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 50_000;
  const url = new URL(req.url);
  const from = parseInt(url.searchParams.get("from") ?? "0", 10) || 0;
  const chain = url.searchParams.get("chain") === "true";

  // 1) 통계청 카테고리 카탈로그 (식품만 — A로 시작하는 itemCode)
  const allItems = await listItems();
  const foodItems = allItems.filter((it) => it.itemCode.startsWith("A"));

  // 2) 우리 Product 한 번에 캐시 (매칭용)
  const products = await prisma.product.findMany({
    select: { id: true, name: true, brand: true, category: true },
  });

  const store = await ensureStatsStore();
  // 데이터 publish lag 있어 최근 30일 안에서 데이터 있는 날짜를 자동 탐색
  const date = await findLatestDataDate();
  if (!date) {
    return NextResponse.json({ ok: false, error: "최근 30일 내 데이터 없음" });
  }

  let totalRowsFetched = 0;
  let matched = 0;
  let inserted = 0;
  let categoriesProcessed = 0;
  let abortedAt = -1;

  for (let i = from; i < foodItems.length; i++) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      abortedAt = i;
      break;
    }

    const item = foodItems[i];
    const { rows } = await getPrices(item.itemCode, date, date, 1, 1000);
    totalRowsFetched += rows.length;
    categoriesProcessed++;

    if (rows.length === 0) continue;

    // 같은 카테고리 안에서 token-matching
    // 카테고리별 평균값(시세)도 별도 저장 — 매칭 안 되는 product에 카테고리 시세로 표시
    const matchedPrices = new Map<string, number[]>(); // productId → prices

    for (const row of rows) {
      for (const p of products) {
        if (matchProductToRow(p.name, p.brand, row.productName)) {
          const arr = matchedPrices.get(p.id) ?? [];
          arr.push(row.discountPrice || row.salePrice);
          matchedPrices.set(p.id, arr);
        }
      }
    }

    // 각 매칭된 product에 대해 평균가/중앙값 1건씩 등록
    for (const [productId, prices] of matchedPrices.entries()) {
      const sorted = [...prices].sort((a, b) => a - b);
      // 중앙값 (이상치 영향 적음)
      const median = sorted[Math.floor(sorted.length / 2)];

      // 같은 (product, store, source=stats_official) 기존 → 삭제 후 재등록
      await prisma.price.deleteMany({
        where: { productId, storeId: store.id, source: "stats_official" },
      });
      await prisma.price.create({
        data: {
          productId,
          storeId: store.id,
          price: median,
          source: "stats_official",
          metadata: { sampleCount: prices.length, category: item.itemName, date } as never,
        },
      });
      matched++;
      inserted++;
    }
  }

  // chain self-trigger
  const partial = abortedAt >= 0;
  if (chain && partial) {
    const host = req.headers.get("host");
    if (host) {
      const proto = host.startsWith("localhost") ? "http" : "https";
      const params = new URLSearchParams({ from: String(abortedAt), chain: "true" });
      void fetch(`${proto}://${host}/api/sync/stats?${params}`, {
        method: "POST",
        headers: { "X-Sync-Token": process.env.SYNC_TOKEN ?? "" },
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    date,
    foodItemsTotal: foodItems.length,
    categoriesProcessed,
    totalRowsFetched,
    matched,
    inserted,
    partial,
    nextFrom: abortedAt,
    elapsedMs: Date.now() - startedAt,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
