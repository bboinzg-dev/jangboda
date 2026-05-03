import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatWon } from "@/lib/format";
import { unitPriceLabel } from "@/lib/units";
import OnboardingCard from "@/components/OnboardingCard";
import RecallBanner from "@/components/RecallBanner";

// ISR — 60초 캐시. 가격 데이터는 10분 단위로 충분.
// 개인화 데이터는 OnboardingCard가 자체 client-side fetch (페이지 ISR 유지를 위해)
export const revalidate = 60;

async function getHomeData() {
  // 모든 쿼리 병렬화 — Sydney 지연 ~150ms × N 누적 회피.
  const [kamisPrices, products, productsCount, storesCount, pricesCount] =
    await Promise.all([
      // KAMIS 시세 — 농수산물 가상 매장의 최신 가격 (홈 위젯용)
      prisma.price.findMany({
        where: { source: "kamis" },
        orderBy: { createdAt: "desc" },
        take: 8,
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
      const prices = p.prices.map((x) => x.price);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
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
      {/* Hero — 앱 의도를 즉시 전달 */}
      <section className="bg-gradient-to-br from-brand-50 to-orange-50 rounded-2xl p-6 md:p-8 border border-brand-100">
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
          <div className="grid grid-cols-2 gap-2 md:flex md:gap-2">
            <Link
              href="/upload"
              className="bg-white hover:bg-stone-50 border border-stone-200 px-4 py-2.5 rounded-lg font-medium text-sm text-center"
            >
              📸 영수증 올리기
            </Link>
            <Link
              href="/stores"
              className="bg-white hover:bg-stone-50 border border-stone-200 px-4 py-2.5 rounded-lg font-medium text-sm text-center"
            >
              📍 주변 마트
            </Link>
          </div>
        </div>
      </section>

      {/* 온보딩 가이드 — 첫 사용자에게 다음 액션 제시 */}
      <OnboardingCard />

      {/* 정부 혜택 추천 — 별도 모듈 진입점 (모바일 BottomNav가 꽉 차서 홈에 카드로 노출) */}
      <section>
        <Link
          href="/benefits"
          className="block bg-gradient-to-br from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 border border-indigo-100 rounded-2xl p-5 md:p-6 transition"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-indigo-700 mb-1">
                정부 혜택 추천 · NEW
              </div>
              <h2 className="text-lg md:text-xl font-bold text-stone-900 mb-1">
                받을 수 있는 정부 지원금, 한 번에
              </h2>
              <p className="text-sm text-stone-600 leading-relaxed">
                중앙정부·구청·시청의 혜택을 통합 매칭. 소상공인·청년·신혼·출산
                등 사각지대 없이.
              </p>
            </div>
            <div className="shrink-0 text-indigo-700 text-2xl leading-none mt-1">›</div>
          </div>
        </Link>
      </section>

      {/* AI 증명사진 — 부가기능 (비밀번호 게이트). 데스크톱에선 더보기에도 노출 */}
      <section>
        <Link
          href="/idphoto"
          className="block bg-gradient-to-br from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border border-amber-100 rounded-2xl p-5 md:p-6 transition"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-amber-700 mb-1">
                부가기능 · 비밀번호 필요 🔒
              </div>
              <h2 className="text-lg md:text-xl font-bold text-stone-900 mb-1">
                AI 증명사진, 30초 만에
              </h2>
              <p className="text-sm text-stone-600 leading-relaxed">
                여권·주민증·비자 등 10가지 규격을 자동 보정·리사이즈. 인쇄용
                저장도 지원.
              </p>
            </div>
            <div className="shrink-0 text-amber-700 text-2xl leading-none mt-1">
              ›
            </div>
          </div>
        </Link>
      </section>

      {/* 식약처 회수·판매중지 식품 배너 — 최근 7일, 안전 경고 */}
      <RecallBanner />

      {/* KAMIS 실시간 시세 — 매일 갱신, 첫 방문자도 즉시 가치 */}
      {kamisPrices.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-bold flex items-center gap-2">
              📊 오늘의 시세
              <span className="text-xs text-stone-500 font-normal">
                KAMIS 공식 평균가
              </span>
            </h2>
            <span className="text-[10px] text-stone-400">매일 갱신</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {kamisPrices.slice(0, 8).map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.product.id}`}
                className="card-clickable relative bg-white border border-stone-200 rounded-lg p-3 pr-6"
              >
                <div className="text-xs text-stone-500 truncate">
                  {p.product.name}
                </div>
                <div className="font-bold text-stone-900 mt-0.5">
                  {formatWon(p.price)}
                </div>
                <div className="text-[10px] text-stone-400">
                  {p.product.unit}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 가격차 큰 상품 — "여기서 사면 N원 절약" */}
      {priceCards.length > 0 && (
        <section>
          <h2 className="text-base font-bold mb-3 flex items-center gap-2">
            💸 가격차 큰 상품 TOP 6
            <span className="text-xs text-stone-500 font-normal">
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

      {/* 미니 통계 — 신뢰감 */}
      <section className="text-center text-xs text-stone-400 pt-2">
        등록 상품 {stats.products.toLocaleString()} · 매장{" "}
        {stats.stores.toLocaleString()} · 가격 데이터{" "}
        {stats.prices.toLocaleString()}건
      </section>
    </div>
  );
}
