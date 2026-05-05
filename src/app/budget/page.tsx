import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { formatWon } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import MonthlyTrendChart from "@/components/MonthlyTrendChart";
import BudgetGoalCard from "@/components/BudgetGoalCard";
import { budgetCategoryOf, CATEGORY_COLORS, type BudgetCategory } from "@/lib/budgetCategory";
import { generateInsights } from "@/lib/budgetInsights";

export const dynamic = "force-dynamic";

// 월 키 (YYYY-MM) 생성
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// 최근 N개월의 월 키 배열 (오래된 → 최신)
function recentMonthKeys(n: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}

type FrequentProduct = {
  productId: string;
  productName: string;
  count: number;          // 구매 횟수 (≥3건만 노출)
  lastDate: Date;
  daysSinceLast: number;  // 마지막 구매 후 N일
  avgInterval: number | null;  // 평균 구매 주기 (일). null이면 데이터 부족
  isDue: boolean;         // "곧 살 때" — daysSinceLast >= avgInterval * 0.85
};

type BudgetData = {
  thisMonthTotal: number;
  // 핵심 KPI — 가계부 헤더의 4개 카드
  kpi: {
    thisMonth: number;             // 이번 달 총 지출
    lastMonth: number;             // 지난 달 총 지출 (비교용)
    monthDeltaPct: number | null;  // (thisMonth - lastMonth) / lastMonth * 100
    savedAmount: number;           // 행사가로 산 누적 절약액 = Σ(listPrice - paidPrice)
    promoCount: number;            // 행사가로 구매한 건수
    totalPriceCount: number;       // 전체 등록 건수
    storeCount: number;            // 다녀본 매장 수
  };
  monthly: { key: string; total: number }[];
  byCategory: { category: BudgetCategory; total: number; color: string }[];
  byStore: { storeName: string; chainName: string; total: number }[];
  overpaid: {
    productId: string;
    productName: string;
    paid: number;
    minPrice: number;
    diff: number;
    minStoreName?: string;
    minChainName?: string;
  }[];
  frequentProducts: FrequentProduct[];  // 자주 사는 상품 + 곧 살 때
  receipts: {
    id: string;
    storeName: string;
    chainName: string;
    date: Date;
    total: number;
    items: { productId: string; name: string; price: number; quantity: number }[];
  }[];
  totalCount: number;
};

async function getBudget(userId: string): Promise<BudgetData> {
  // 본인 contributor Price 또는 본인 uploader Receipt에 연결된 Price만 (가계부 = 내가 쓴 것)
  // verified 영수증만 (Receipt.storeId 있는 경우 — 매장 식별됨)
  const myPrices = await prisma.price.findMany({
    where: {
      OR: [
        { contributorId: userId },
        { receipt: { uploaderId: userId, storeId: { not: null } } },
      ],
    },
    include: {
      product: { select: { id: true, name: true, category: true } },
      store: { include: { chain: true } },
      receipt: { select: { storeId: true, uploaderId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // verified 기준: receipt 통한 건 receipt.storeId 필수, contributor 직접 등록 건은 storeId가 모델에 강제됨
  const valid = myPrices.filter((p) => {
    // receipt 경유면 receipt.storeId 있어야 함
    if (p.receipt) return !!p.receipt.storeId;
    return true;
  });

  // 사용자가 실제 지불한 금액 = paidPrice (행사 적용가) ?? listPrice (정가)
  const paidOf = (p: { paidPrice: number | null; listPrice: number | null }) =>
    p.paidPrice ?? p.listPrice ?? 0;

  // 이번 달 / 지난 달 합계 — KPI 비교용
  const now = new Date();
  const curKey = monthKey(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastKey = monthKey(lastMonthDate);
  const thisMonthTotal = valid
    .filter((p) => monthKey(p.createdAt) === curKey)
    .reduce((s, p) => s + paidOf(p), 0);
  const lastMonthTotal = valid
    .filter((p) => monthKey(p.createdAt) === lastKey)
    .reduce((s, p) => s + paidOf(p), 0);
  const monthDeltaPct =
    lastMonthTotal > 0
      ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100)
      : null;

  // 누적 절약액 — 행사가로 산 모든 건의 (listPrice - paidPrice) 합산
  // 사용자에게 "행사 활용으로 N원 아꼈어요" 보상감 신호
  let savedAmount = 0;
  let promoCount = 0;
  for (const p of valid) {
    if (p.paidPrice != null && p.listPrice != null && p.paidPrice < p.listPrice) {
      savedAmount += p.listPrice - p.paidPrice;
      promoCount++;
    }
  }
  const totalPriceCount = valid.length;
  const storeCount = new Set(
    valid.map((p) => p.store?.id).filter((id): id is string => !!id),
  ).size;

  // 최근 6개월 월별 합계
  const keys = recentMonthKeys(6);
  const monthlyMap = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const p of valid) {
    const k = monthKey(p.createdAt);
    if (monthlyMap.has(k)) {
      monthlyMap.set(k, (monthlyMap.get(k) ?? 0) + paidOf(p));
    }
  }
  const monthly = keys.map((k) => ({ key: k, total: monthlyMap.get(k) ?? 0 }));

  // 카테고리별 — 메가 카테고리(신선식품/유제품/가공즉석/음료/...)로 정상화
  // ("참가격 등록 상품" / "사용자 등록" 같은 무의미한 출처 메타 그룹화 해소)
  const catMap = new Map<BudgetCategory, number>();
  for (const p of valid) {
    const cat = budgetCategoryOf(p.product?.name ?? "", p.product?.category);
    catMap.set(cat, (catMap.get(cat) ?? 0) + paidOf(p));
  }
  const byCategory = Array.from(catMap.entries())
    .map(([category, total]) => ({
      category,
      total,
      color: CATEGORY_COLORS[category],
    }))
    .sort((a, b) => b.total - a.total);

  // 매장별 상위 5
  const storeMap = new Map<
    string,
    { storeName: string; chainName: string; total: number }
  >();
  for (const p of valid) {
    if (!p.store) continue;
    const key = p.store.id;
    const cur = storeMap.get(key) ?? {
      storeName: p.store.name,
      chainName: p.store.chain.name,
      total: 0,
    };
    cur.total += paidOf(p);
    storeMap.set(key, cur);
  }
  const byStore = Array.from(storeMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // 평균보다 비싸게 산 Top 5 — 같은 product의 정가 최저가 vs 본인이 실제 낸 금액 비교
  // (시장 비교 기준은 listPrice로 통일 — 행사 만료 추정 불가 정책)
  // 강화: 어느 매장에서 더 쌌는지 (chainName + storeName)도 함께 조회 → "더 싼 매장" 안내
  const productIds = Array.from(new Set(valid.map((p) => p.productId)));
  const minByProduct = new Map<
    string,
    { listPrice: number; storeName: string; chainName: string }
  >();
  if (productIds.length > 0) {
    const allMinsWithStore = await prisma.price.findMany({
      where: { productId: { in: productIds } },
      select: {
        productId: true,
        listPrice: true,
        store: { select: { name: true, chain: { select: { name: true } } } },
      },
      orderBy: { listPrice: "asc" },
    });
    for (const p of allMinsWithStore) {
      if (!minByProduct.has(p.productId) && p.store) {
        minByProduct.set(p.productId, {
          listPrice: p.listPrice,
          storeName: p.store.name,
          chainName: p.store.chain.name,
        });
      }
    }
  }

  // 자주 사는 상품 (단골) + 평균 주기 계산 → "곧 살 때" 알림
  // - 같은 productId 등장 횟수 ≥3건만 단골
  // - 평균 주기 = 구매일 간격의 산술평균
  // - "곧 살 때" = 마지막 구매 후 평균 주기의 85% 이상 경과
  const productPurchases = new Map<string, { name: string; dates: Date[] }>();
  for (const p of valid) {
    if (!p.product) continue;
    const cur = productPurchases.get(p.productId) ?? { name: p.product.name, dates: [] };
    cur.dates.push(p.createdAt);
    productPurchases.set(p.productId, cur);
  }
  const frequentProducts: FrequentProduct[] = [];
  for (const [productId, { name, dates }] of productPurchases) {
    if (dates.length < 3) continue;
    dates.sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      const diff = (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
      if (diff > 0) intervals.push(diff);
    }
    const avgInterval = intervals.length > 0
      ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length)
      : null;
    const lastDate = dates[dates.length - 1];
    const daysSinceLast = Math.round((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    const isDue = avgInterval !== null && daysSinceLast >= avgInterval * 0.85;
    frequentProducts.push({
      productId,
      productName: name,
      count: dates.length,
      lastDate,
      daysSinceLast,
      avgInterval,
      isDue,
    });
  }
  // "곧 살 때" 우선, 그 다음 횟수 desc
  frequentProducts.sort((a, b) => {
    if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
    return b.count - a.count;
  });
  const topFrequent = frequentProducts.slice(0, 8);

  // 본인이 산 가격 중 가장 비싼 것 vs 최저가 비교 — 같은 상품 여러 번이면 최고 지불 사용
  const myMaxByProduct = new Map<string, { paid: number; productName: string }>();
  for (const p of valid) {
    const cur = myMaxByProduct.get(p.productId);
    const myPaid = paidOf(p);
    if (!cur || myPaid > cur.paid) {
      myMaxByProduct.set(p.productId, {
        paid: myPaid,
        productName: p.product?.name ?? "(이름 없음)",
      });
    }
  }
  const overpaid = Array.from(myMaxByProduct.entries())
    .map(([productId, v]) => {
      const minInfo = minByProduct.get(productId);
      const minPrice = minInfo?.listPrice ?? v.paid;
      return {
        productId,
        productName: v.productName,
        paid: v.paid,
        minPrice,
        diff: v.paid - minPrice,
        minStoreName: minInfo?.storeName,
        minChainName: minInfo?.chainName,
      };
    })
    .filter((x) => x.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 5);

  // 영수증별 거래 내역 — 본인 영수증 + 그 안의 prices, 거래일(createdAt) 기준 정렬
  const myReceipts = await prisma.receipt.findMany({
    where: {
      uploaderId: userId,
      status: "verified",
      storeId: { not: null },
    },
    include: {
      store: { include: { chain: true } },
      prices: {
        include: { product: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50, // 최근 50건
  });

  const receipts = myReceipts.map((r) => {
    const items = r.prices.map((p) => ({
      productId: p.productId,
      name: p.product?.name ?? "(이름 없음)",
      price: p.paidPrice ?? p.listPrice ?? 0, // 사용자 실제 지불액
      quantity: 1,
    }));
    const total = items.reduce((s, it) => s + it.price, 0);
    // 영수증 거래일은 첫 Price.createdAt 사용 (영수증 거래일이 그곳에 저장됨)
    const date = r.prices[0]?.createdAt ?? r.createdAt;
    return {
      id: r.id,
      storeName: r.store?.name ?? "(매장 없음)",
      chainName: r.store?.chain?.name ?? "",
      date,
      total,
      items,
    };
  });

  return {
    thisMonthTotal,
    kpi: {
      thisMonth: thisMonthTotal,
      lastMonth: lastMonthTotal,
      monthDeltaPct,
      savedAmount,
      promoCount,
      totalPriceCount,
      storeCount,
    },
    monthly,
    byCategory,
    byStore,
    overpaid,
    frequentProducts: topFrequent,
    receipts,
    totalCount: valid.length,
  };
}

export default async function BudgetPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const data = await getBudget(user.id);

  if (data.totalCount === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">가계부</h1>
        <EmptyState
          illustration="/illustrations/receipt-illustration.png"
          icon="🧾"
          title="지금 영수증 한 장 올리면 가계부가 시작됩니다"
          description={
            <>
              자동으로 분석해드려요:
              <ul className="mt-3 space-y-1 text-left inline-block text-stone-600">
                <li>• 📅 월별 소비 추이 그래프</li>
                <li>• 🥕 카테고리별 지출 비중</li>
                <li>• 🏪 매장별 누적 소비 Top 5</li>
                <li>• 💸 평균보다 비싸게 산 상품 알림</li>
              </ul>
            </>
          }
          actions={[
            { href: "/upload", label: "📸 영수증 올리기", primary: true },
            { href: "/stores", label: "주변 마트 먼저 보기" },
          ]}
        />
      </div>
    );
  }

  const maxMonthly = Math.max(...data.monthly.map((m) => m.total), 1);
  const totalCategorySum = data.byCategory.reduce((s, c) => s + c.total, 0) || 1;
  const promoRate =
    data.kpi.totalPriceCount > 0
      ? Math.round((data.kpi.promoCount / data.kpi.totalPriceCount) * 100)
      : 0;
  const insights = generateInsights(data);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📊 가계부</h1>
        <Link
          href="/upload"
          className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg font-medium"
        >
          + 영수증 추가
        </Link>
      </div>

      {/* 4-KPI 헤더 — 가계부의 핵심 지표를 한눈에 */}
      <header className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* 1. 이번 달 지출 — primary */}
        <div className="bg-gradient-to-br from-brand-50 to-brand-100 border border-brand-200 rounded-xl p-4">
          <div className="text-[11px] text-brand-700 font-medium">
            이번 달 ({new Date().getMonth() + 1}월) 지출
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-brand-700 mt-1 tabular-nums">
            {formatWon(data.kpi.thisMonth)}
          </div>
          {data.kpi.monthDeltaPct !== null && (
            <div className="text-[11px] text-stone-600 mt-1">
              지난달{" "}
              <span
                className={
                  data.kpi.monthDeltaPct > 0
                    ? "text-rose-600 font-medium"
                    : data.kpi.monthDeltaPct < 0
                    ? "text-emerald-600 font-medium"
                    : "text-ink-3"
                }
              >
                {data.kpi.monthDeltaPct > 0 ? "▲" : data.kpi.monthDeltaPct < 0 ? "▼" : "─"}
                {Math.abs(data.kpi.monthDeltaPct)}%
              </span>
            </div>
          )}
        </div>

        {/* 2. 누적 절약 — 행사가 활용 보상 */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="text-[11px] text-emerald-700 font-medium">
            🎉 누적 절약
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-emerald-700 mt-1 tabular-nums">
            {formatWon(data.kpi.savedAmount)}
          </div>
          <div className="text-[11px] text-stone-600 mt-1">행사가로 아낀 합</div>
        </div>

        {/* 3. 행사 활용 빈도 */}
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
          <div className="text-[11px] text-rose-700 font-medium">
            행사 활용
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-rose-700 mt-1 tabular-nums">
            {data.kpi.promoCount}
            <span className="text-sm text-rose-600 font-medium">/{data.kpi.totalPriceCount}건</span>
          </div>
          <div className="text-[11px] text-stone-600 mt-1">
            할인·번들·1+1 ({promoRate}%)
          </div>
        </div>

        {/* 4. 매장 다양성 */}
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
          <div className="text-[11px] text-sky-700 font-medium">
            🏪 다녀본 매장
          </div>
          <div className="text-xl md:text-2xl font-extrabold text-sky-700 mt-1 tabular-nums">
            {data.kpi.storeCount}
            <span className="text-sm text-sky-600 font-medium">곳</span>
          </div>
          <div className="text-[11px] text-stone-600 mt-1">
            총 {data.totalCount}건 등록
          </div>
        </div>
      </header>

      {/* 월 예산 진행률 — 미설정 시 "예산 설정" CTA, 설정 시 진행률 바 */}
      <BudgetGoalCard thisMonth={data.kpi.thisMonth} />

      {/* 자동 인사이트 — 룰 기반으로 데이터에서 발견한 멘트 */}
      {insights.length > 0 && (
        <section className="bg-white border border-line rounded-xl p-5">
          <h2 className="font-bold text-ink-1 mb-3 flex items-center gap-2">
            💡 오늘의 발견
            <span className="text-xs text-ink-3 font-normal">
              ({insights.length}건)
            </span>
          </h2>
          <div className="space-y-2">
            {insights.map((ins, i) => {
              const toneStyle =
                ins.tone === "positive"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : ins.tone === "negative"
                  ? "bg-rose-50 border-rose-200 text-rose-900"
                  : "bg-amber-50 border-amber-200 text-amber-900";
              const Wrapper = ins.link ? Link : "div";
              const wrapperProps = ins.link
                ? { href: ins.link, className: "block hover:opacity-90" }
                : {};
              return (
                <Wrapper
                  key={i}
                  {...(wrapperProps as { href: string; className: string })}
                >
                  <div
                    className={`flex items-start gap-3 border rounded-lg p-3 ${toneStyle}`}
                  >
                    <span className="text-lg shrink-0" aria-hidden>
                      {ins.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug">
                        {ins.text}
                      </div>
                      {ins.detail && (
                        <div className="text-xs opacity-75 mt-0.5">
                          {ins.detail}
                        </div>
                      )}
                    </div>
                    {ins.link && (
                      <span className="text-sm opacity-60 shrink-0">›</span>
                    )}
                  </div>
                </Wrapper>
              );
            })}
          </div>
        </section>
      )}

      {/* 자주 사는 상품 — 단골 + "곧 살 때" 알림 */}
      {data.frequentProducts.length > 0 && (
        <section className="bg-white border border-line rounded-xl p-5">
          <h2 className="font-bold text-ink-1 mb-3 flex items-center gap-2">
            🔁 자주 사는 상품
            <span className="text-xs text-ink-3 font-normal">
              ({data.frequentProducts.length}건)
            </span>
          </h2>
          <ul className="space-y-2">
            {data.frequentProducts.map((fp) => (
              <li key={fp.productId}>
                <Link
                  href={`/products/${fp.productId}`}
                  className="block bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-lg p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-ink-1 truncate">
                          {fp.productName}
                        </span>
                        {fp.isDue && (
                          <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-medium shrink-0">
                            🔔 곧 살 때
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-3 mt-1 flex items-center gap-2 flex-wrap">
                        <span>
                          {fp.count}회 구매 · 마지막{" "}
                          <span className="font-medium text-ink-2">{fp.daysSinceLast}일 전</span>
                        </span>
                        {fp.avgInterval !== null && (
                          <span>
                            · 평균 {fp.avgInterval}일마다
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-ink-3 shrink-0">›</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 월별 추세 라인차트 — SVG (recharts 안 씀, 번들 보호) */}
      <section className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="font-bold mb-3">📈 최근 6개월 소비 추이</h2>
        <MonthlyTrendChart data={data.monthly} currentKey={monthKey(new Date())} />
      </section>

      {/* 카테고리별 — 메가 카테고리(신선식품/유제품/음료/...) 정상화 */}
      <section className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="font-bold mb-3">🥕 카테고리별 소비</h2>
        {/* 가로 스택 바 */}
        <div className="flex h-3 rounded-full overflow-hidden bg-stone-100 mb-4">
          {data.byCategory.map((c) => {
            const pct = (c.total / totalCategorySum) * 100;
            return (
              <div
                key={c.category}
                style={{ width: `${pct}%`, backgroundColor: c.color }}
                title={`${c.category}: ${formatWon(c.total)}`}
              />
            );
          })}
        </div>
        <ul className="space-y-1.5 text-sm">
          {data.byCategory.map((c) => {
            const pct = ((c.total / totalCategorySum) * 100).toFixed(1);
            return (
              <li
                key={c.category}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="truncate">{c.category}</span>
                </span>
                <span className="text-stone-600 shrink-0 ml-3">
                  {formatWon(c.total)}{" "}
                  <span className="text-xs text-stone-400">({pct}%)</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 영수증별 거래 내역 — 언제·어디서·무엇 */}
      <section className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="font-bold mb-3">🧾 영수증별 거래 내역</h2>
        {data.receipts.length === 0 ? (
          <div className="text-sm text-stone-500">
            영수증 등록 내역이 없어요.
          </div>
        ) : (
          <ul className="space-y-3">
            {data.receipts.map((r) => {
              const dateStr = r.date.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                weekday: "short",
              });
              return (
                <li
                  key={r.id}
                  className="border border-stone-200 rounded-lg overflow-hidden"
                >
                  <details className="group">
                    <summary className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer hover:bg-stone-50 list-none">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-stone-500">{dateStr}</div>
                        <div className="font-semibold text-ink-1 truncate">
                          {r.chainName ? `${r.chainName} · ` : ""}
                          {r.storeName}
                        </div>
                        <div className="text-xs text-stone-500">
                          {r.items.length}개 품목
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold tabular-nums text-ink-1">
                          {formatWon(r.total)}
                        </div>
                        <div className="text-[10px] text-stone-400 group-open:hidden">
                          ▼ 펼치기
                        </div>
                        <div className="text-[10px] text-stone-400 hidden group-open:block">
                          ▲ 접기
                        </div>
                      </div>
                    </summary>
                    <ul className="border-t border-stone-100 bg-stone-50/40">
                      {r.items.map((it, i) => (
                        <li
                          key={`${r.id}-${i}`}
                          className="flex items-center justify-between px-3 py-1.5 text-sm border-b border-stone-100 last:border-0"
                        >
                          <Link
                            href={`/products/${it.productId}`}
                            className="hover:underline truncate min-w-0 text-ink-2"
                          >
                            {it.name}
                          </Link>
                          <span className="font-medium tabular-nums text-ink-1 shrink-0 ml-3">
                            {formatWon(it.price)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 매장별 Top 5 */}
      <section className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="font-bold mb-3">매장별 소비 Top 5</h2>
        {data.byStore.length === 0 ? (
          <div className="text-sm text-stone-500">매장 데이터 없음</div>
        ) : (
          <ul className="space-y-2">
            {data.byStore.map((s, i) => (
              <li
                key={`${s.chainName}-${s.storeName}-${i}`}
                className="flex items-center justify-between text-sm border-b border-stone-100 last:border-0 pb-2 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.chainName}</div>
                  <div className="text-xs text-stone-500 truncate">
                    {s.storeName}
                  </div>
                </div>
                <div className="font-bold text-stone-700 shrink-0 ml-3">
                  {formatWon(s.total)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 평균보다 비싸게 산 Top 5 */}
      <section className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="font-bold mb-1">💸 더 싸게 살 수 있었던 상품 Top 5</h2>
        <p className="text-xs text-stone-500 mb-3">
          본인이 산 가격 vs 등록된 최저가
        </p>
        {data.overpaid.length === 0 ? (
          <div className="text-sm text-stone-500">
            축하합니다 — 모두 최저가로 사셨네요!
          </div>
        ) : (
          <ul className="space-y-2">
            {data.overpaid.map((o) => {
              const pct = Math.round((o.diff / o.minPrice) * 100);
              return (
                <li
                  key={o.productId}
                  className="border-b border-stone-100 last:border-0 pb-2 last:pb-0"
                >
                  <Link
                    href={`/products/${o.productId}`}
                    className="block hover:bg-stone-50 -mx-1 px-1 py-1 rounded"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-ink-1 truncate">
                          {o.productName}
                        </div>
                        {o.minChainName && (
                          <div className="text-xs text-emerald-700 mt-0.5">
                            💡{" "}
                            <span className="font-medium">{o.minChainName}</span>
                            {o.minStoreName && o.minStoreName !== o.minChainName ? ` ${o.minStoreName}` : ""}
                            에서 더 싸게 살 수 있어요
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-rose-600 font-bold text-sm">
                          +{formatWon(o.diff)}
                        </div>
                        <div className="text-xs text-stone-500 tabular-nums">
                          {formatWon(o.paid)} → {formatWon(o.minPrice)} (+{pct}%)
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
