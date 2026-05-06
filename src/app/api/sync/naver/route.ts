import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 30);
  const from = Math.max(0, parseInt(searchParams.get("from") ?? "0", 10) || 0);
  const chain = searchParams.get("chain") === "true";
  // ?recent=24h — 최근 N시간 안에 추가된 신규 상품만 sync (매시간 cron용)
  const recentMatch = searchParams.get("recent")?.match(/^(\d+)h$/);
  const recentHours = recentMatch ? parseInt(recentMatch[1], 10) : null;
  const startedAt = Date.now();
  const TIMEOUT_BUDGET_MS = 50_000; // Vercel 60s에서 10s 여유
  const onlyMajor = searchParams.get("onlyMajor") === "true";

  // where 절 — 기본 농수산물 제외 + recent 옵션
  const baseWhere: Prisma.ProductWhereInput = {
    category: { not: "농수산물" },
    ...(recentHours !== null
      ? {
          createdAt: {
            gte: new Date(Date.now() - recentHours * 60 * 60 * 1000),
          },
        }
      : {}),
  };

  // 전체 카탈로그 수 (partial 판단용)
  const totalProducts = await prisma.product.count({ where: baseWhere });

  const products = await prisma.product.findMany({
    where: baseWhere,
    skip: from,
    take: limit,
    orderBy: { createdAt: recentHours !== null ? "desc" : "asc" },
  });

  // 가공식품 — 네이버 검색 결과 첫 항목의 maker/brand로 manufacturer 자동 채움
  // (이미 채워진 상품은 그대로)
  for (const p of products) {
    if (!p.manufacturer && p.brand) {
      // 다음 단계 fetch에서 maker 정보 가져옴 — 일단 brand를 manufacturer로
      try {
        await prisma.product.update({
          where: { id: p.id },
          data: { manufacturer: p.brand },
        });
      } catch {
        // ignore
      }
    }
  }

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
          select: { listPrice: true },
        }),
      ]);

      const avg =
        existing.length > 0
          ? existing.reduce((s, p) => s + p.listPrice, 0) / existing.length
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

    // Product.imageUrl이 비어 있고, 첫 결과의 image URL이 있으면 자동 채움
    // (네이버 쇼핑 썸네일 — shopping-phinf.pstatic.net 호스팅)
    const firstItemWithImage = items.find((it) => it.image);
    if (!product.imageUrl && firstItemWithImage?.image) {
      try {
        await prisma.product.update({
          where: { id: product.id },
          data: { imageUrl: firstItemWithImage.image },
        });
      } catch {
        // ignore — 동시성/이미 채워진 경우
      }
    }

    // mall 이름을 canonical로 변환 후 mall당 최저가 + 그 link 저장
    //
    // 비메이저 몰은 항상 skip — canonicalMallName 미매칭 셀러는 같은 product 이름이라도
    // 사양·단위가 다른 경우 多 (예: 30구 친환경 계란 product에 10구 가격이 매핑되어
    // 비교 부정확). UI에서 hide 중이지만 DB에 남으면 헤더 통계 누수·차트 노이즈 유발.
    // onlyMajor 파라미터는 호환성 위해 유지하되, 비메이저는 무조건 차단.
    const byCanonical = new Map<
      string,
      { canonical: string; isMajor: boolean; price: number; productUrl: string }
    >();
    for (const it of items) {
      const { canonical, isMajor } = canonicalMallName(it.mallName);
      if (!isMajor) {
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
      // 네이버는 정가 미공개 → listPrice = 응답가
      await prisma.price.create({
        data: {
          productId: product.id,
          storeId: store.id,
          listPrice: price,
          paidPrice: null,
          promotionType: null,
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

  // partial-resume + chain self-trigger
  // 처리 끝까지 못 갔으면 (abortedEarly 또는 from+products.length < total) partial
  const processedThrough = from + products.length;
  const partial = abortedEarly || processedThrough < totalProducts;

  // chain=true 면 다음 chunk를 fire-and-forget으로 자동 호출 (cron 1번으로 600 cover)
  if (chain && partial && processedThrough < totalProducts) {
    const host = req.headers.get("host");
    if (host) {
      const proto = host.startsWith("localhost") ? "http" : "https";
      const params = new URLSearchParams({
        limit: String(limit),
        from: String(processedThrough),
        chain: "true",
      });
      if (onlyMajor) params.set("onlyMajor", "true");
      const nextUrl = `${proto}://${host}/api/sync/naver?${params}`;
      void fetch(nextUrl, {
        method: "POST",
        headers: { "X-Sync-Token": process.env.SYNC_TOKEN || "" },
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    productsProcessed: products.length,
    totalProducts,
    inserted,
    storesCreated,
    usedMockCount,
    skippedNonMajor,
    abortedEarly,
    partial,
    processedThrough,
    chain,
    elapsedMs: Date.now() - startedAt,
    samples: samples.slice(0, 5),
  });
}
