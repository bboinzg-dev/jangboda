import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatWon } from "@/lib/format";
import { unitPriceLabel, unitPriceValue } from "@/lib/units";
import OnboardingCard from "@/components/OnboardingCard";
import RecallBanner from "@/components/RecallBanner";
import KamisTicker from "@/components/KamisTicker";

// ISR — 60초 캐시. 가격 데이터는 10분 단위로 충분.
// 개인화 데이터는 OnboardingCard가 자체 client-side fetch (페이지 ISR 유지를 위해)
export const revalidate = 60;

async function getHomeData() {
  // 모든 쿼리 병렬화 — Sydney 지연 ~150ms × N 누적 회피.
  const [kamisPrices, products, productsCount, storesCount, pricesCount] =
    await Promise.all([
      // KAMIS 시세 — 농수산물 가상 매장 — ticker용 충분히 가져옴
      prisma.price.findMany({
        where: { source: "kamis" },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { product: true },
        distinct: ["productId"],
      }),
      // 가격차 큰 상품 (최저가 vs 최고가 차이 큰 순)
      prisma.product.findMany({
        where: { category: { not: "농수산물" } },
        take: 30,
        include: { prices: { take: 50, orderBy: { createdAt: "desc" } } },
      }),
      prisma.product.count(),
      prisma.store.count(),
      prisma.price.count(),
    ]);

  const priceCards = products
    .map((p) => {
      if (p.prices.length === 0) return null;

      // 단가 기반 outlier 제외 — 코스트코 대용량 박스 같은 다른 패키지는 비교에서 빼고
      // "가격차" 부풀려지는 거 방지. PriceListClient와 동일한 ±50%/+70% 기준.
      const withUnitPrice = p.prices.map((x) => ({
        price: x.price,
        unitPrice: unitPriceValue(x.price, p.unit),
      }));
      const validUnit = withUnitPrice
        .map((x) => x.unitPrice)
        .filter((v): v is number => v !== null && v > 0)
        .sort((a, b) => a - b);
      const median =
        validUnit.length >= 4
          ? validUnit[Math.floor(validUnit.length / 2)]
          : null;

      const filteredPrices =
        median !== null
          ? withUnitPrice
              .filter(
                (x) =>
                  x.unitPrice === null ||
                  (x.unitPrice >= median * 0.5 && x.unitPrice <= median * 1.7)
              )
              .map((x) => x.price)
          : withUnitPrice.map((x) => x.price);

      if (filteredPrices.length === 0) return null;
      const min = Math.min(...filteredPrices);
      const max = Math.max(...filteredPrices);
      const diff = max - min;
      if (diff === 0) return null;
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        unit: p.unit,
        min,
        max,
        diff,
        hasHaccp: p.hasHaccp,
        excludedCount: p.prices.length - filteredPrices.length,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 6);

  const stats = { products: productsCount, stores: storesCount, prices: pricesCount };

  return { kamisPrices, priceCards, stats };
}

export default async function HomePage() {
  const { kamisPrices, priceCards, stats } = await getHomeData();

  return (
    <div className="space-y-8">
      {/* Hero — 앱 의도를 즉시 전달 + 큰 일러스트로 첫 인상 강화 */}
      <section className="bg-gradient-to-br from-brand-50 to-orange-50 rounded-2xl p-6 md:p-8 border border-brand-100 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-stone-900 mb-2">
              오늘 뭐 사세요?
            </h1>
            <p className="text-stone-600 mb-5 leading-relaxed text-sm md:text-base">
              살 물건들을 모아보면 어느 마트가 가장 싼지 알려드려요.
              <br />
              영수증 한 장으로 동네 이웃 모두가 절약합니다.
            </p>

            {/* 메인 CTA + 보조 액션 */}
            <div className="space-y-2">
              <Link
                href="/cart"
                className="block w-full md:inline-flex md:w-auto bg-brand-500 hover:bg-brand-600 text-white text-center px-6 py-3.5 rounded-xl font-bold text-base shadow-md hover:shadow-lg transition-shadow"
              >
                🛒 장보기 비교 시작
              </Link>
              <div className="grid grid-cols-3 gap-2 md:flex md:gap-2">
                <Link
                  href="/upload"
                  className="bg-white hover:bg-stone-50 border border-stone-200 px-3 md:px-4 py-2.5 rounded-lg font-medium text-sm text-center"
                >
                  📸 영수증
                </Link>
                <Link
                  href="/scan"
                  className="bg-white hover:bg-stone-50 border border-stone-200 px-3 md:px-4 py-2.5 rounded-lg font-medium text-sm text-center"
                >
                  📷 바코드
                </Link>
                <Link
                  href="/stores"
                  className="bg-white hover:bg-stone-50 border border-stone-200 px-3 md:px-4 py-2.5 rounded-lg font-medium text-sm text-center"
                >
                  📍 주변 마트
                </Link>
              </div>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/home-hero.png"
            alt=""
            aria-hidden
            className="hidden md:block w-44 lg:w-56 h-auto justify-self-end"
            loading="eager"
          />
        </div>
        {/* 모바일 — 우측 일러스트 대신 하단 배너로 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/home-hero.png"
          alt=""
          aria-hidden
          className="md:hidden mt-4 w-32 h-32 mx-auto block"
          loading="eager"
        />
      </section>

      {/* 온보딩 가이드 — 첫 사용자에게 다음 액션 제시 */}
      <OnboardingCard />

      {/* 식약처 회수·판매중지 식품 배너 — 최근 7일, 안전 경고 */}
      <RecallBanner />

      {/* KAMIS 실시간 시세 — 자동 ticker (위로 흐름 + 마우스오버 일시정지) */}
      {kamisPrices.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-bold flex items-center gap-2">
              📊 오늘의 시세
              <span className="text-xs text-stone-500 font-normal">
                KAMIS 공식 평균가
              </span>
            </h2>
            <Link
              href="/kamis"
              className="text-xs text-brand-600 hover:underline font-medium"
            >
              전체 보기 →
            </Link>
          </div>
          <KamisTicker
            items={kamisPrices.map((p) => {
              const m = ((p as { metadata?: unknown }).metadata ?? null) as
                | { changeAmount?: number; changePct?: number }
                | null;
              return {
                id: p.id,
                productId: p.product.id,
                productName: p.product.name,
                productUnit: p.product.unit,
                price: p.price,
                changeAmount: m?.changeAmount ?? null,
                changePct: m?.changePct ?? null,
              };
            })}
          />
        </section>
      )}

      {/* 가격차 큰 상품 — "여기서 사면 N원 절약" */}
      {priceCards.length > 0 && (
        <section>
          <h2 className="text-base font-bold mb-3 flex items-center gap-2">
            💸 가격차 큰 상품 TOP 6
            <span
              className="text-xs text-stone-500 font-normal"
              title="단가 기준으로 다른 패키지(대용량 박스 등)는 비교에서 제외"
            >
              마트별 비교 효과 큼
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {priceCards.map((c) => {
              const upl = unitPriceLabel(c.min, c.unit);
              return (
                <Link
                  key={c.id}
                  href={`/products/${c.id}`}
                  className="card-clickable relative bg-white border border-stone-200 rounded-lg p-4 pr-8 flex justify-between items-center"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-stone-500">{c.category}</div>
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-stone-500">{c.unit}</div>
                    {c.hasHaccp && (
                      <span className="inline-flex items-center rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium mt-1">
                        🏅 HACCP
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <div className="text-xs text-stone-500">최저</div>
                    <div className="font-bold text-brand-600">
                      {formatWon(c.min)}
                    </div>
                    {upl && (
                      <div className="text-[10px] text-stone-500">{upl}</div>
                    )}
                    <div className="text-xs text-rose-600 mt-0.5">
                      💰 최대 {formatWon(c.diff)} 절약
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 가치 0건 안내 — 시드만 있을 때 */}
      {priceCards.length === 0 && kamisPrices.length === 0 && (
        <section className="bg-white border border-stone-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">🛒</div>
          <h2 className="font-bold mb-1">아직 가격 데이터가 부족해요</h2>
          <p className="text-sm text-stone-500 mb-4">
            첫 영수증을 올리면 비교가 시작됩니다.
          </p>
          <Link
            href="/upload"
            className="inline-block bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg font-medium text-sm"
          >
            📸 영수증 올리기
          </Link>
        </section>
      )}

      {/* 부가 서비스 — 장보기 외 함께 사용할 수 있는 서비스 */}
      <section>
        <h2 className="text-base font-bold mb-1 flex items-center gap-2">
          💡 부가 서비스
        </h2>
        <p className="text-xs text-stone-500 mb-3">
          장보기 외에 함께 사용할 수 있는 서비스
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href="/benefits"
            className="block bg-gradient-to-br from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 border border-indigo-100 rounded-2xl p-5 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-indigo-700 mb-1">
                  정부 혜택 추천
                </div>
                <h3 className="text-base font-bold text-stone-900 mb-1">
                  받을 수 있는 정부 지원금, 한 번에
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  중앙정부·구청·시청의 혜택을 통합 매칭.
                </p>
              </div>
              <div className="shrink-0 text-indigo-700 text-xl leading-none mt-1">
                ›
              </div>
            </div>
          </Link>

          <Link
            href="/idphoto"
            className="block bg-gradient-to-br from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border border-amber-100 rounded-2xl p-5 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-amber-700 mb-1">
                  AI 증명사진 · 비밀번호 필요
                </div>
                <h3 className="text-base font-bold text-stone-900 mb-1">
                  AI 증명사진, 30초 만에
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  여권·주민증·비자 등 10가지 규격을 자동 보정.
                </p>
              </div>
              <div className="shrink-0 text-amber-700 text-xl leading-none mt-1">
                ›
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* 미니 통계 — 신뢰감 */}
      <section className="text-center text-xs text-stone-400 pt-2">
        등록 상품 {stats.products.toLocaleString()} · 매장{" "}
        {stats.stores.toLocaleString()} · 가격 데이터{" "}
        {stats.prices.toLocaleString()}건
      </section>
    </div>
  );
}
