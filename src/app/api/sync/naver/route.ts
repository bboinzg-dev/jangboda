import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchNaverShop, pickLowestByMall } from "@/lib/naverShop";
import { checkSyncAuth } from "@/lib/auth";
import { canonicalMallName } from "@/lib/onlineMalls";

// Vercel 함수 timeout — 네이버 API 호출 N회로 시간 소요. 60초까지 허용.
export const maxDuration = 60;

// "120g x 5개" → "5개" 같은 단위 키워드 추출 (검색 정밀도 향상용)
function extractUnitKeyword(unit: string): string {
  if (!unit) return "";
  const matches = unit.match(/(\d+(?:\.\d+)?\s*(?:개입|구|봉|입|병|캔|팩|kg|L|ml|g))/gi);
  if (!matches) return "";
  return matches[matches.length - 1].replace(/\s/g, "");
}

// 온라인 가상 매장 보장 — 메이저 몰만 개별 store, 나머지는 "기타 온라인몰" 하나로 묶음
// race condition 방지: chain.upsert + (chainId, name) UNIQUE를 활용한 안전한 upsert
async function ensureOnlineStore(canonicalName: string, isMajor: boolean) {
  const chain = await prisma.chain.upsert({
    where: { name: canonicalName },
    update: {},
    create: { name: canonicalName },
  });

  const storeName = isMajor ? `${canonicalName} 온라인몰` : "기타 온라인몰";

  // 동일 chain 안에 store가 이미 있으면 재사용 (race condition 회피)
  const existing = await prisma.store.findFirst({
    where: { chainId: chain.id, name: storeName },
  });
  if (existing) return { store: existing, created: false };

  try {
    const store = await prisma.store.create({
      data: {
        chainId: chain.id,
        name: storeName,
        address: "온라인 (전국 배송)",
        lat: 0,
        lng: 0,
        hours: "24시간",
      },
    });
    return { store, created: true };
  } catch {
    // 동시 요청으로 이미 만들어졌을 수 있음 — 다시 조회
    const retry = await prisma.store.findFirst({
      where: { chainId: chain.id, name: storeName },
    });
    if (!retry) throw new Error("store 생성 실패");
    return { store: retry, created: false };
  }
}

// POST /api/sync/naver — 카탈로그 상품을 네이버에서 검색해 온라인몰별 가격 등록
export async function POST(req: NextRequest) {
  const authErr = checkSyncAuth(req);
  if (authErr) return authErr;

  const { searchParams } = new URL(req.url);
  // default 10 — 60초 timeout 안전 마진 (이전 20은 504 가끔 발생)
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10"), 30);
  const startedAt = Date.now();
  const TIMEOUT_BUDGET_MS = 50_000; // Vercel 60s에서 10s 여유
  const onlyMajor = searchParams.get("onlyMajor") === "true";

  const products = await prisma.product.findMany({
    where: { category: { not: "농수산물" } },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  // 1단계 (병렬): 모든 상품에 대해 네이버 검색 + outlier 계산
  const fetched = await Promise.all(
    products.map(async (product) => {
      const unitKw = extractUnitKeyword(product.unit);
      const query = [
        product.brand,
        product.name.replace(product.brand ?? "", "").trim(),
        unitKw,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      const [{ items, usedMock }, existing] = await Promise.all([
        fetchNaverShop(query),
        prisma.price.findMany({
          where: {
            productId: product.id,
            source: { in: ["seed", "manual", "receipt"] },
          },
          select: { price: true },
        }),
      ]);

      const avg =
        existing.length > 0
          ? existing.reduce((s, p) => s + p.price, 0) / existing.length
          : null;

      // outlier 필터
      // - 기존 샘플이 충분(3+)하면 ±70% 적용
      // - 부족하면 절대값 범위 (300원~500,000원)로 보수적 처리
      const lowestByMall = pickLowestByMall(items).filter((it) => {
        if (it.lprice <= 0) return false;
        if (existing.length >= 3 && avg !== null) {
          return it.lprice >= avg * 0.3 && it.lprice <= avg * 3;
        }
        return it.lprice >= 300 && it.lprice <= 500_000;
      });

      return { product, items: lowestByMall, usedMock };
    })
  );

  // 2단계: mall 이름 정규화 (메이저몰만 개별 chain으로, 나머지는 묶음)
  // 같은 product+canonical mall에는 최저가 1건만 등록
  let inserted = 0;
  let storesCreated = 0;
  let usedMockCount = 0;
  let skippedNonMajor = 0;
  let abortedEarly = false;
  const samples: Array<{ product: string; malls: string[] }> = [];

  for (const { product, items, usedMock } of fetched) {
    // 시간 초과 직전이면 중단하고 partial 결과 반환 (504 회피)
    if (Date.now() - startedAt > TIMEOUT_BUDGET_MS) {
      abortedEarly = true;
      break;
    }
    if (usedMock) usedMockCount++;

    // mall 이름을 canonical로 변환 후 mall당 최저가 + 그 link 저장
    const byCanonical = new Map<
      string,
      { canonical: string; isMajor: boolean; price: number; productUrl: string }
    >();
    for (const it of items) {
      const { canonical, isMajor } = canonicalMallName(it.mallName);
      if (onlyMajor && !isMajor) {
        skippedNonMajor++;
        continue;
      }
      const cur = byCanonical.get(canonical);
      if (!cur || it.lprice < cur.price) {
        byCanonical.set(canonical, {
          canonical,
          isMajor,
          price: it.lprice,
          productUrl: it.link ?? "",
        });
      }
    }

    const malls: string[] = [];
    for (const { canonical, isMajor, price, productUrl } of byCanonical.values()) {
      const { store, created } = await ensureOnlineStore(canonical, isMajor);
      if (created) storesCreated++;

      // 같은 (product, store, source: naver) 의 기존 row 제거 후 새로 INSERT
      await prisma.price.deleteMany({
        where: { productId: product.id, storeId: store.id, source: "naver" },
      });
      await prisma.price.create({
        data: {
          productId: product.id,
          storeId: store.id,
          price,
          source: "naver",
          productUrl: productUrl || null,
        },
      });
      inserted++;
      malls.push(`${canonical}:${price}`);
    }

    if (malls.length > 0) {
      samples.push({ product: product.name, malls });
    }
  }

  return NextResponse.json({
    ok: true,
    productsProcessed: products.length,
    inserted,
    storesCreated,
    usedMockCount,
    skippedNonMajor,
    abortedEarly,
    elapsedMs: Date.now() - startedAt,
    samples: samples.slice(0, 5),
  });
}
