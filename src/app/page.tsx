import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { formatWon } from "@/lib/format";
import { unitPriceParts, unitPriceValue } from "@/lib/units";
import OnboardingCard from "@/components/OnboardingCard";
import RecallTicker from "@/components/RecallTicker";
import KamisTicker from "@/components/KamisTicker";
import ProductImage from "@/components/ProductImage";
import {
  IconCart,
  IconCamera,
  IconBarcode,
  IconPin,
  IconArrowRight,
} from "@/components/icons";

// ISR — 60초 캐시. 가격 데이터는 10분 단위로 충분.
// 개인화 데이터는 OnboardingCard가 자체 client-side fetch (페이지 ISR 유지를 위해)
export const revalidate = 60;

async function getHomeData() {
  // 모든 쿼리 병렬화 — Sydney 지연 ~150ms × N 누적 회피.
  const sevenDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const [
    kamisPrices,
    statsPrices,
    recalls,
    products,
    productsCount,
    storesCount,
    pricesCount,
  ] = await Promise.all([
      // KAMIS 시세 — 농수산물 가상 매장 — ticker용 충분히 가져옴
      prisma.price.findMany({
        where: { source: "kamis" },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { product: true },
        distinct: ["productId"],
      }),
      // 통계청 시세 — 가공식품 (라면/김치/식용유 등)
      prisma.price.findMany({
        where: { source: "stats_official" },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { product: true },
        distinct: ["productId"],
      }),
      // 회수·판매중지 (최근 7일)
      prisma.recall.findMany({
        where: { registeredAt: { gte: sevenDaysAgo } },
        orderBy: { registeredAt: "desc" },
        take: 10,
      }),
      // 가격차 큰 상품 (최저가 vs 최고가 차이 큰 순) — 시세 가격 제외
      prisma.product.findMany({
        where: { category: { not: "농수산물" } },
        take: 30,
        include: {
          prices: {
            where: { source: { not: "stats_official" } },
            take: 50,
            orderBy: { createdAt: "desc" },
          },
        },
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
      // 단가 기준 절약률 — 같은 용량으로 환산했을 때의 절약 비율 (사용자에게 더 의미)
      const minUnit = unitPriceValue(min, p.unit);
      const maxUnit = unitPriceValue(max, p.unit);
      const unitSavingsPct =
        minUnit !== null && maxUnit !== null && maxUnit > 0
          ? Math.round(((maxUnit - minUnit) / maxUnit) * 100)
          : null;
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        unit: p.unit,
        min,
        max,
        diff,
        unitSavingsPct,
        hasHaccp: p.hasHaccp,
        imageUrl: p.imageUrl,
        excludedCount: p.prices.length - filteredPrices.length,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 6);

  const stats = { products: productsCount, stores: storesCount, prices: pricesCount };

  // 시세 ticker = KAMIS + 통계청 합쳐서 흘림
  const tickerData = [...kamisPrices, ...statsPrices].map((p) => ({
    id: p.id,
    productId: p.product.id,
    productName: p.product.name,
    productUnit: p.product.unit,
    productImageUrl: p.product.imageUrl,
    price: p.price,
  }));

  // 회수 ticker — recall.productName으로 우리 카탈로그 product 매칭해서 이미지 추가
  // (정확 매칭 못해도 text는 그대로 표시)
  const recallNames = recalls.map((r) => r.productName).filter(Boolean);
  const matchedProducts = recallNames.length > 0
    ? await prisma.product.findMany({
        where: {
          OR: recallNames.map((n) => ({ name: { contains: n.slice(0, 20) } })),
        },
        select: { name: true, imageUrl: true },
      })
    : [];
  const productImageByName = new Map<string, string>();
  for (const p of matchedProducts) {
    if (p.imageUrl) productImageByName.set(p.name, p.imageUrl);
  }
  const recallTickerData = recalls.map((r) => {
    // 매칭 시도 — recall.productName이 product.name에 포함되면 사용
    let imageUrl: string | null = null;
    for (const [pName, url] of productImageByName.entries()) {
      if (
        pName.includes(r.productName) ||
        r.productName.includes(pName)
      ) {
        imageUrl = url;
        break;
      }
    }
    return {
      id: r.id,
      productName: r.productName,
      productImageUrl: imageUrl,
      manufacturer: r.manufacturer,
      reason: r.reason,
      grade: r.grade,
    };
  });

  // 오늘의 시세 = KAMIS(농수산물) + 통계청(가공식품) 병합
  return { tickerData, recallTickerData, priceCards, stats };
}

export default async function HomePage() {
  const { tickerData, recallTickerData, priceCards, stats } = await getHomeData();

  return (
    <div className="space-y-8">
      {/* Hero — 앱 의도를 즉시 전달 + 큰 일러스트로 첫 인상 강화 */}
      <section className="bg-surface-muted rounded-2xl p-6 md:p-8 border border-line overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <h1 className="text-2xl md:text-[28px] font-extrabold tracking-tight text-ink-1 mb-2">
              오늘 뭐 사세요?
            </h1>
            <p className="text-ink-2 mb-5 leading-relaxed text-sm md:text-base">
              살 물건들을 모아보면 어느 마트가 가장 싼지 알려드려요.
              <br />
              영수증 한 장으로 동네 이웃 모두가 절약합니다.
            </p>

            {/* 메인 CTA + 보조 액션 */}
            <div className="space-y-2">
              <Link
                href="/cart"
                className="inline-flex w-full md:w-auto items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-6 py-3.5 rounded-xl font-bold text-base transition-colors"
              >
                <IconCart className="w-5 h-5" />
                장보기 비교 시작
              </Link>
              <div className="grid grid-cols-3 gap-2 md:flex md:gap-2">
                <Link
                  href="/upload"
                  className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-stone-50 border border-line px-3 md:px-4 py-2.5 rounded-lg font-medium text-sm text-ink-2"
                >
                  <IconCamera size={16} />
                  영수증
                </Link>
                <Link
                  href="/scan"
                  className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-stone-50 border border-line px-3 md:px-4 py-2.5 rounded-lg font-medium text-sm text-ink-2"
                >
                  <IconBarcode size={16} />
                  바코드
                </Link>
                <Link
                  href="/stores"
                  className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-stone-50 border border-line px-3 md:px-4 py-2.5 rounded-lg font-medium text-sm text-ink-2"
                >
                  <IconPin size={16} />
                  주변 마트
                </Link>
              </div>
            </div>
          </div>
          {/* hero illustration — LCP 후보라 priority로 즉시 fetch */}
          <Image
            src="/illustrations/home-hero.png"
            alt=""
            aria-hidden
            width={224}
            height={224}
            priority
            className="hidden md:block w-44 lg:w-56 h-auto justify-self-end"
          />
        </div>
        {/* 모바일 — 우측 일러스트 대신 하단 배너로 */}
        <Image
          src="/illustrations/home-hero.png"
          alt=""
          aria-hidden
          width={128}
          height={128}
          priority
          className="md:hidden mt-4 w-32 h-32 mx-auto block"
        />
      </section>

      {/* 온보딩 가이드 — 첫 사용자에게 다음 액션 제시 */}
      <OnboardingCard />

      {/* 시세 + 회수·판매중지 — 좌우 2칼럼 (모바일은 세로 스택) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 오늘의 시세 — KAMIS(농수산물) + 통계청(가공식품) ticker */}
        {tickerData.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-base font-bold flex items-center gap-2 text-ink-1">
                📊 오늘의 시세
                <span className="hidden md:inline text-xs text-ink-3 font-normal">
                  KAMIS · 통계청
                </span>
              </h2>
              <Link
                href="/kamis"
                className="text-xs text-brand-600 hover:underline font-medium inline-flex items-center gap-0.5"
              >
                전체 보기
                <IconArrowRight size={12} />
              </Link>
            </div>
            <KamisTicker items={tickerData} />
          </section>
        )}

        {/* 회수·판매중지 식품 — 최근 7일 ticker */}
        {recallTickerData.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-base font-bold flex items-center gap-2 text-danger-text">
                🚨 회수·판매중지
                <span className="hidden md:inline text-xs text-ink-3 font-normal">
                  최근 7일
                </span>
              </h2>
              <Link
                href="/recalls"
                className="text-xs text-danger-text hover:opacity-80 font-medium inline-flex items-center gap-0.5"
              >
                전체보기
                <IconArrowRight size={12} />
              </Link>
            </div>
            <RecallTicker items={recallTickerData} />
          </section>
        )}
      </div>

      {/* 가격차 큰 상품 — "여기서 사면 N원 절약" */}
      {priceCards.length > 0 && (
        <section>
          <h2 className="text-base font-bold mb-3 flex items-center gap-2 text-ink-1">
            가격차가 큰 상품
            <span
              className="text-xs text-ink-3 font-normal"
              title="단가 기준으로 다른 패키지(대용량 박스 등)는 비교에서 제외"
            >
              마트별 비교 효과 큼
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {priceCards.map((c) => {
              const uparts = unitPriceParts(c.min, c.unit);
              return (
                <Link
                  key={c.id}
                  href={`/products/${c.id}`}
                  className="card-clickable relative bg-white border border-line rounded-xl p-4 pr-8 flex justify-between items-center gap-3 hover:border-line-strong transition-colors"
                >
                  {/* 카드 좌측 썸네일 — 네이버 쇼핑 동기화로 자동 채움 */}
                  <ProductImage src={c.imageUrl} alt={c.name} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-ink-3">{c.category}</div>
                    {/* 긴 상품명도 2줄까지는 보이게 — 모바일에서 핵심 정보 손실 방지 */}
                    <div className="font-semibold line-clamp-2 leading-snug text-ink-1">{c.name}</div>
                    <div className="text-xs text-ink-3 mt-0.5">{c.unit}</div>
                    {c.hasHaccp && (
                      <span className="inline-flex items-center rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium mt-1">
                        🏅 HACCP
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    {uparts ? (
                      <>
                        {/* 단가를 메인으로 — 패키지 차이 무시하고 같은 기준으로 비교 */}
                        <div className="text-[10px] text-ink-3 font-medium leading-none">
                          최저 {uparts.basis}
                        </div>
                        <div className="text-[18px] font-extrabold tabular-nums text-ink-1 font-mono leading-tight">
                          {uparts.amount}
                        </div>
                        <div className="text-[11px] text-ink-3 tabular-nums">
                          실판매가 {formatWon(c.min)}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs text-ink-3">최저</div>
                        <div className="text-[18px] font-extrabold tabular-nums text-ink-1">
                          {formatWon(c.min)}
                        </div>
                      </>
                    )}
                    <div className="text-xs text-danger-text mt-0.5 font-medium">
                      {c.unitSavingsPct !== null && c.unitSavingsPct > 0
                        ? `단가 ${c.unitSavingsPct}% 절약`
                        : `최대 ${formatWon(c.diff)} 절약`}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 가치 0건 안내 — 시드만 있을 때 */}
      {priceCards.length === 0 && tickerData.length === 0 && (
        <section className="bg-white border border-line rounded-xl p-8 text-center">
          <div className="flex justify-center mb-3 text-ink-2">
            <IconCart size={40} />
          </div>
          <h2 className="font-bold mb-1 text-ink-1">아직 가격 데이터가 부족해요</h2>
          <p className="text-sm text-ink-3 mb-4">
            첫 영수증을 올리면 비교가 시작됩니다.
          </p>
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg font-medium text-sm"
          >
            <IconCamera size={16} />
            영수증 올리기
          </Link>
        </section>
      )}

      {/* 부가 서비스 — 장보기 외 함께 사용할 수 있는 서비스 */}
      <section>
        <h2 className="text-base font-bold mb-1 flex items-center gap-2 text-ink-1">
          부가 서비스
        </h2>
        <p className="text-xs text-ink-3 mb-3">
          장보기 외에 함께 사용할 수 있는 서비스
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href="/benefits"
            className="block bg-surface-muted hover:bg-stone-100 border border-line hover:border-line-strong rounded-2xl p-5 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-ink-2 mb-1">
                  정부 혜택 추천
                </div>
                <h3 className="text-base font-bold text-ink-1 mb-1">
                  받을 수 있는 정부 지원금, 한 번에
                </h3>
                <p className="text-xs text-ink-2 leading-relaxed">
                  중앙정부·구청·시청의 혜택을 통합 매칭.
                </p>
              </div>
              <div className="shrink-0 text-ink-2 mt-1">
                <IconArrowRight size={18} />
              </div>
            </div>
          </Link>

          <Link
            href="/idphoto"
            className="block bg-surface-muted hover:bg-stone-100 border border-line hover:border-line-strong rounded-2xl p-5 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-ink-2 mb-1">
                  AI 증명사진 · 비밀번호 필요
                </div>
                <h3 className="text-base font-bold text-ink-1 mb-1">
                  AI 증명사진, 30초 만에
                </h3>
                <p className="text-xs text-ink-2 leading-relaxed">
                  여권·주민증·비자 등 10가지 규격을 자동 보정.
                </p>
              </div>
              <div className="shrink-0 text-ink-2 mt-1">
                <IconArrowRight size={18} />
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* 미니 통계 — 신뢰감 */}
      <section className="text-center text-xs text-ink-3 pt-2">
        등록 상품 {stats.products.toLocaleString()} · 매장{" "}
        {stats.stores.toLocaleString()} · 가격 데이터{" "}
        {stats.prices.toLocaleString()}건
      </section>
    </div>
  );
}
