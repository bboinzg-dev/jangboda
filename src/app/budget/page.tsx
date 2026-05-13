import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { formatWon } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import MonthlyTrendChart from "@/components/MonthlyTrendChart";
import BudgetGoalCard from "@/components/BudgetGoalCard";
import FavoriteToggle from "@/components/FavoriteToggle";
import CategorySelect from "@/components/CategorySelect";
import ManualEntryDialog from "@/components/ManualEntryDialog";
import ShareSavingsButton from "@/components/ShareSavingsButton";
import RemovePriceButton from "@/components/budget/RemovePriceButton";
import {
  Badge,
  Card,
  Caption,
  KpiCard,
  Num,
  Progress,
  Sparkline,
  TrendingIcon,
  TrendingDownIcon,
  SparkleIcon,
  FlameIcon,
  BellIcon,
  StoreIcon,
  WalletIcon,
} from "@/components/ui";
import { budgetCategoryOf, CATEGORY_COLORS, type BudgetCategory } from "@/lib/budgetCategory";
import { generateInsights } from "@/lib/budgetInsights";
import { unitPriceValue, unitBasisLabel } from "@/lib/units";
import { kstMonthKey, kstNow } from "@/lib/kst";

export const dynamic = "force-dynamic";

const monthKey = kstMonthKey;

function recentMonthKeys(n: number): string[] {
  const now = kstNow();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() - i;
    const d = new Date(Date.UTC(y, m, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

type FrequentProduct = {
  productId: string;
  productName: string;
  count: number;
  lastDate: Date;
  daysSinceLast: number;
  avgInterval: number | null;
  isDue: boolean;
};

type BudgetData = {
  thisMonthTotal: number;
  kpi: {
    thisMonth: number;
    lastMonth: number;
    monthDeltaPct: number | null;
    lastYearTotal: number;
    yearDeltaPct: number | null;
    savedAmount: number;
    promoCount: number;
    promoBase: number;
    totalPriceCount: number;
    storeCount: number;
  };
  monthly: { key: string; total: number }[];
  byCategory: {
    category: BudgetCategory;
    total: number;
    color: string;
    unitAvgLabel: string | null;
  }[];
  byStore: { storeId: string; storeName: string; chainName: string; total: number }[];
  overpaid: {
    productId: string;
    productName: string;
    paid: number;
    minPrice: number;
    diff: number;
    minStoreName?: string;
    minChainName?: string;
  }[];
  frequentProducts: FrequentProduct[];
  receipts: {
    id: string;
    storeName: string;
    chainName: string;
    date: Date;
    total: number;
    items: {
      priceId: string;
      productId: string;
      name: string;
      price: number;
      quantity: number;
      lineTotal: number;
      category: string;
      isOverride: boolean;
    }[];
  }[];
  totalCount: number;
};

async function getBudget(userId: string): Promise<BudgetData & { overrides: Record<string, string> }> {
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { budgetCategoryOverrides: true },
  });
  const overrides = (userRow?.budgetCategoryOverrides as Record<string, string>) ?? {};

  const myPrices = await prisma.price.findMany({
    where: {
      OR: [
        { contributorId: userId },
        { receipt: { uploaderId: userId, storeId: { not: null } } },
      ],
    },
    include: {
      product: { select: { id: true, name: true, category: true, unit: true } },
      store: { include: { chain: true } },
      receipt: { select: { storeId: true, uploaderId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const valid = myPrices.filter((p) => {
    if (p.receipt) return !!p.receipt.storeId;
    return true;
  });

  const quantityOf = (p: { metadata: unknown }) => {
    const m = p.metadata as { quantity?: number } | null | undefined;
    const q = m?.quantity;
    return typeof q === "number" && q > 1 ? q : 1;
  };
  const paidOf = (p: {
    paidPrice: number | null;
    listPrice: number | null;
    metadata: unknown;
  }) => (p.paidPrice ?? p.listPrice ?? 0) * quantityOf(p);

  const now = kstNow();
  const curKey = monthKey(new Date());
  const lastMonthDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
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

  let savedAmount = 0;
  let promoCount = 0;
  let promoBase = 0;
  for (const p of valid) {
    if (p.listPrice != null && p.listPrice > 0) {
      promoBase++;
      if (p.paidPrice != null && p.paidPrice < p.listPrice) {
        savedAmount += (p.listPrice - p.paidPrice) * quantityOf(p);
        promoCount++;
      }
    }
  }
  const totalPriceCount = valid.length;
  const storeCount = new Set(
    valid.map((p) => p.store?.id).filter((id): id is string => !!id),
  ).size;

  const keys = recentMonthKeys(12);
  const monthlyMap = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const p of valid) {
    const k = monthKey(p.createdAt);
    if (monthlyMap.has(k)) {
      monthlyMap.set(k, (monthlyMap.get(k) ?? 0) + paidOf(p));
    }
  }
  const monthly = keys.map((k) => ({ key: k, total: monthlyMap.get(k) ?? 0 }));

  const lastYearKey = `${now.getUTCFullYear() - 1}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const lastYearTotal = valid
    .filter((p) => monthKey(p.createdAt) === lastYearKey)
    .reduce((s, p) => s + paidOf(p), 0);
  const yearDeltaPct =
    lastYearTotal > 0
      ? Math.round(((thisMonthTotal - lastYearTotal) / lastYearTotal) * 100)
      : null;

  const resolveCategory = (productId: string, name: string, productCat?: string | null) => {
    const ov = overrides[productId];
    if (ov) return ov as BudgetCategory;
    return budgetCategoryOf(name, productCat);
  };
  type CatBucket = { total: number; unitSamples: Map<string, number[]> };
  const catMap = new Map<BudgetCategory, CatBucket>();
  for (const p of valid) {
    const cat = resolveCategory(p.productId, p.product?.name ?? "", p.product?.category);
    const bucket = catMap.get(cat) ?? { total: 0, unitSamples: new Map() };
    bucket.total += paidOf(p);
    const unitText = p.product?.unit;
    const basis = unitText ? unitBasisLabel(unitText) : null;
    const unitPrice = unitText ? unitPriceValue(p.paidPrice ?? p.listPrice ?? 0, unitText) : null;
    if (basis && unitPrice !== null && unitPrice > 0) {
      const arr = bucket.unitSamples.get(basis) ?? [];
      arr.push(unitPrice);
      bucket.unitSamples.set(basis, arr);
    }
    catMap.set(cat, bucket);
  }
  const byCategory = Array.from(catMap.entries())
    .map(([category, bucket]) => {
      let bestBasis: string | null = null;
      let bestSamples: number[] = [];
      for (const [basis, samples] of bucket.unitSamples) {
        if (samples.length > bestSamples.length) {
          bestBasis = basis;
          bestSamples = samples;
        }
      }
      let unitAvgLabel: string | null = null;
      if (bestBasis && bestSamples.length >= 3) {
        const avg = bestSamples.reduce((s, x) => s + x, 0) / bestSamples.length;
        unitAvgLabel = `${bestBasis} ${Math.round(avg).toLocaleString("ko-KR")}원`;
      }
      return { category, total: bucket.total, color: CATEGORY_COLORS[category], unitAvgLabel };
    })
    .sort((a, b) => b.total - a.total);

  const storeMap = new Map<
    string,
    { storeId: string; storeName: string; chainName: string; total: number }
  >();
  for (const p of valid) {
    if (!p.store) continue;
    const key = p.store.id;
    const cur = storeMap.get(key) ?? {
      storeId: p.store.id,
      storeName: p.store.name,
      chainName: p.store.chain.name,
      total: 0,
    };
    cur.total += paidOf(p);
    storeMap.set(key, cur);
  }
  const byStore = Array.from(storeMap.values()).sort((a, b) => b.total - a.total).slice(0, 5);

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
      productId, productName: name, count: dates.length,
      lastDate, daysSinceLast, avgInterval, isDue,
    });
  }
  frequentProducts.sort((a, b) => {
    if (a.isDue !== b.isDue) return a.isDue ? -1 : 1;
    return b.count - a.count;
  });
  const topFrequent = frequentProducts.slice(0, 8);

  const myMaxByProduct = new Map<string, { listPrice: number; productName: string }>();
  for (const p of valid) {
    const list = p.listPrice ?? 0;
    if (list <= 0) continue;
    const cur = myMaxByProduct.get(p.productId);
    if (!cur || list > cur.listPrice) {
      myMaxByProduct.set(p.productId, {
        listPrice: list,
        productName: p.product?.name ?? "(이름 없음)",
      });
    }
  }
  const overpaid = Array.from(myMaxByProduct.entries())
    .map(([productId, v]) => {
      const minInfo = minByProduct.get(productId);
      const minPrice = minInfo?.listPrice ?? v.listPrice;
      return {
        productId,
        productName: v.productName,
        paid: v.listPrice,
        minPrice,
        diff: v.listPrice - minPrice,
        minStoreName: minInfo?.storeName,
        minChainName: minInfo?.chainName,
      };
    })
    .filter((x) => x.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 5);

  const myReceipts = await prisma.receipt.findMany({
    where: { uploaderId: userId, status: "verified", storeId: { not: null } },
    include: {
      store: { include: { chain: true } },
      prices: {
        include: { product: { select: { id: true, name: true, category: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const receipts = myReceipts.map((r) => {
    const items = r.prices.map((p) => {
      const cat = resolveCategory(p.productId, p.product?.name ?? "", p.product?.category);
      const unit = p.paidPrice ?? p.listPrice ?? 0;
      const q = quantityOf(p);
      return {
        priceId: p.id,
        productId: p.productId,
        name: p.product?.name ?? "(이름 없음)",
        price: unit,
        quantity: q,
        lineTotal: unit * q,
        category: cat,
        isOverride: !!overrides[p.productId],
      };
    });
    const total = items.reduce((s, it) => s + it.lineTotal, 0);
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
      lastYearTotal,
      yearDeltaPct,
      savedAmount,
      promoCount,
      promoBase,
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
    overrides,
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
              <ul className="mt-3 space-y-1 text-left inline-block text-ink-2">
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

  const totalCategorySum = data.byCategory.reduce((s, c) => s + c.total, 0) || 1;
  const promoRate =
    data.kpi.promoBase > 0
      ? Math.round((data.kpi.promoCount / data.kpi.promoBase) * 100)
      : 0;
  const insights = generateInsights(data);
  const monthLabel = kstNow().getUTCMonth() + 1;

  // KPI sparkline용 — monthly의 최근 6개월 total 배열
  const sparkSeries = data.monthly.slice(-6).map((m) => m.total);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Caption>지영님의 가계부 · 2026년 {monthLabel}월</Caption>
          <h1 className="mt-1.5 text-[28px] md:text-[36px] font-extrabold text-ink-1 tracking-[-1px]">
            이번달 식료품 · <span className="text-brand-500">{formatWon(data.kpi.thisMonth)}</span>
          </h1>
          {data.kpi.monthDeltaPct !== null && (
            <p className="text-sm text-ink-2 mt-1">
              지난달보다{" "}
              <strong
                className={
                  data.kpi.monthDeltaPct < 0 ? "text-success-text" : "text-danger-text"
                }
              >
                {data.kpi.monthDeltaPct < 0
                  ? `${formatWon(Math.abs(data.kpi.lastMonth - data.kpi.thisMonth))} 적게`
                  : `${formatWon(data.kpi.thisMonth - data.kpi.lastMonth)} 더`}
              </strong>{" "}
              썼어요. 행사 활용률 {promoRate}%.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="/api/budget/export"
            download
            className="inline-flex items-center justify-center min-h-[40px] px-3 py-2 border border-line-strong bg-surface text-ink-1 hover:bg-surface-muted text-sm rounded-xl font-medium transition"
            title="가계부 데이터를 CSV로 다운로드"
          >
            내보내기
          </a>
          <ManualEntryDialog />
          <ShareSavingsButton
            savedAmount={data.kpi.savedAmount}
            thisMonth={data.kpi.thisMonth}
            monthLabel={monthLabel}
          />
          <Link
            href="/upload"
            className="inline-flex items-center justify-center min-h-[40px] px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-xl font-medium shadow-soft hover:shadow-raise transition"
          >
            + 영수증 추가
          </Link>
        </div>
      </div>

      {/* KPI 4종 — hero(이번달) + 보조 3개 */}
      <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr] gap-3 md:gap-4">
        <KpiCard
          label={`이번달 · ${monthLabel}월`}
          value={data.kpi.thisMonth}
          note={`${data.totalCount}건 · ${data.kpi.storeCount}곳`}
          spark={sparkSeries}
          deltaValue={
            data.kpi.monthDeltaPct !== null
              ? `${data.kpi.monthDeltaPct > 0 ? "+" : ""}${data.kpi.monthDeltaPct}%`
              : "—"
          }
          deltaLabel="지난달 대비"
          tone={
            data.kpi.monthDeltaPct === null
              ? "neutral"
              : data.kpi.monthDeltaPct < 0
                ? "success"
                : "danger"
          }
          hero
        />
        <KpiCard
          label="지난달"
          value={data.kpi.lastMonth}
          spark={data.monthly.slice(-7, -1).map((m) => m.total)}
          note={`${monthLabel === 1 ? 12 : monthLabel - 1}월 전체`}
          deltaValue={
            data.kpi.lastMonth > 0
              ? `${formatWon(data.kpi.lastMonth)}`
              : "데이터 없음"
          }
          deltaLabel=""
          tone="neutral"
        />
        <KpiCard
          label={`작년 ${monthLabel}월`}
          value={data.kpi.lastYearTotal}
          spark={[
            data.kpi.lastYearTotal * 0.6,
            data.kpi.lastYearTotal * 0.7,
            data.kpi.lastYearTotal * 0.8,
            data.kpi.lastYearTotal * 0.9,
            data.kpi.lastYearTotal * 0.95,
            data.kpi.lastYearTotal,
          ]}
          note="작년 동월"
          deltaValue={
            data.kpi.yearDeltaPct !== null
              ? `${data.kpi.yearDeltaPct > 0 ? "+" : ""}${data.kpi.yearDeltaPct}%`
              : "—"
          }
          deltaLabel="vs 이번달"
          tone={
            data.kpi.yearDeltaPct === null
              ? "neutral"
              : data.kpi.yearDeltaPct < 0
                ? "success"
                : "warning"
          }
        />
        <KpiCard
          label="누적 절약"
          value={data.kpi.savedAmount}
          spark={[10, 18, 22, 28, 38, Math.max(47, data.kpi.savedAmount / 1000)]}
          note="행사가로 아낀 합계"
          deltaValue={`행사 ${promoRate}%`}
          deltaLabel="활용률"
          tone="brand"
          accent
        />
      </div>

      {/* 월 예산 진행률 */}
      <BudgetGoalCard thisMonth={data.kpi.thisMonth} />

      {/* 인사이트 — 그라데이션 카드 */}
      {insights.length > 0 && (
        <Card
          className="p-5 md:p-6"
          style={{
            background:
              "linear-gradient(135deg, var(--surface) 0%, var(--brand-soft) 100%)",
            borderColor: "var(--line-strong)",
          }}
        >
          <Caption>오늘의 발견</Caption>
          <h2 className="mt-1.5 text-xl font-bold tracking-tight text-ink-1 mb-4 inline-flex items-center gap-2">
            <SparkleIcon size={18} className="text-brand-500" />
            {insights.length}건 추천
          </h2>
          <div className="grid gap-3">
            {insights.map((ins, i) => {
              const tone = ins.tone === "positive" ? "success" : ins.tone === "negative" ? "danger" : "warning";
              const Wrapper = ins.link ? Link : "div";
              const wrapperProps = ins.link
                ? { href: ins.link, className: "block hover:opacity-90" }
                : {};
              return (
                <Wrapper key={i} {...(wrapperProps as { href: string; className: string })}>
                  <div className="bg-surface border border-line rounded-xl p-3.5 flex gap-3 items-start">
                    <div className="w-7 h-7 rounded-lg bg-brand-soft text-brand-ink flex items-center justify-center shrink-0">
                      {ins.tone === "positive" ? <TrendingDownIcon size={14} />
                        : ins.tone === "negative" ? <TrendingIcon size={14} />
                          : <FlameIcon size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-ink-1">{ins.text}</div>
                      {ins.detail && (
                        <div className="text-xs text-ink-3 mt-0.5">{ins.detail}</div>
                      )}
                    </div>
                    {ins.link && <span className="text-ink-3 shrink-0">›</span>}
                  </div>
                </Wrapper>
              );
            })}
          </div>
        </Card>
      )}

      {/* 자주 사는 상품 + 매장 Top5 */}
      <div className="grid md:grid-cols-[1.5fr_1fr] gap-4">
        {data.frequentProducts.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="p-5 flex items-baseline justify-between">
              <div>
                <Caption>곧 살 때</Caption>
                <h2 className="mt-1 text-lg font-bold tracking-tight text-ink-1">자주 사는 상품</h2>
              </div>
              <span className="text-xs text-ink-3 tabular-nums">{data.frequentProducts.length}건</span>
            </div>
            {/* 헤더 행 — 데스크톱에서만 표시. 모바일은 카드 형태로 흐름 */}
            <div className="hidden md:grid md:grid-cols-[1fr_90px_100px_110px] px-4 py-2 bg-surface-sunken text-[11px] uppercase tracking-wider text-ink-3 font-semibold border-y border-line">
              <span>상품</span>
              <span>다음 구매</span>
              <span>구매 횟수</span>
              <span className="text-right">자세히</span>
            </div>
            {data.frequentProducts.map((fp) => (
              <Link
                key={fp.productId}
                href={`/products/${fp.productId}`}
                className={[
                  // 모바일: 2-컬럼 (상품정보 / 다음구매). 데스크톱: 4-컬럼 그리드.
                  "grid grid-cols-[1fr_auto] md:grid-cols-[1fr_90px_100px_110px] gap-3 md:gap-0 px-4 py-3 border-b border-line last:border-b-0 items-center transition hover:bg-surface-muted",
                  fp.isDue ? "bg-brand-soft/40" : "",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div className="text-sm md:text-[13.5px] font-semibold text-ink-1 truncate">
                    {fp.productName}
                  </div>
                  <div className="text-[11px] text-ink-3 mt-0.5 tabular-nums">
                    {fp.count}회 · 마지막 {fp.daysSinceLast}일 전
                  </div>
                </div>
                <div className="shrink-0">
                  {fp.isDue ? (
                    <Badge tone="brand" icon={<BellIcon size={11} />}>살 때</Badge>
                  ) : fp.avgInterval !== null ? (
                    <span className="text-xs text-ink-3 font-mono">
                      ~{Math.max(0, fp.avgInterval - fp.daysSinceLast)}일 후
                    </span>
                  ) : (
                    <span className="text-xs text-ink-4">—</span>
                  )}
                </div>
                {/* 모바일에선 위 메타라인에 이미 N회가 노출되므로 중복 컬럼 숨김 */}
                <div className="hidden md:block">
                  <Badge tone="neutral">{fp.count}회</Badge>
                </div>
                <div className="hidden md:block text-right text-ink-3 text-sm">›</div>
              </Link>
            ))}
          </Card>
        )}

        {/* 매장 Top5 */}
        {data.byStore.length > 0 && (
          <Card className="p-5">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <Caption>매장 Top 5</Caption>
                <h2 className="mt-1 text-lg font-bold tracking-tight text-ink-1">자주 가는 매장</h2>
              </div>
              <span className="text-xs text-ink-3 tabular-nums">{data.totalCount}건 · {data.kpi.storeCount}곳</span>
            </div>
            <ul>
              {data.byStore.map((s, i) => {
                const pct = Math.round((s.total / (data.byStore[0]?.total || 1)) * 100);
                return (
                  <li
                    key={s.storeId}
                    className="py-3.5 border-b border-line last:border-b-0"
                  >
                    <div className="flex justify-between items-baseline">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={[
                            "w-[22px] h-[22px] rounded-md text-[11px] font-bold flex items-center justify-center font-mono shrink-0",
                            i === 0 ? "bg-brand-500 text-white" : "bg-surface-muted text-ink-3",
                          ].join(" ")}
                        >
                          {i + 1}
                        </span>
                        <FavoriteToggle storeId={s.storeId} size="sm" />
                        <Link href={`/stores/${s.storeId}`} className="min-w-0">
                          <span className="text-sm font-semibold text-ink-1 truncate block">
                            {s.chainName}
                          </span>
                          <span className="text-[11px] text-ink-3 truncate block">
                            {s.storeName}
                          </span>
                        </Link>
                      </div>
                      <Num value={s.total} size={14} weight={700} />
                    </div>
                    <div className="flex items-center gap-2.5 mt-2 ml-8">
                      <div className="flex-1">
                        <Progress
                          value={pct}
                          tone={i === 0 ? "brand" : "neutral"}
                          height={4}
                        />
                      </div>
                      <span className="text-[11px] text-ink-3 font-mono w-12 text-right tabular-nums">
                        {pct}%
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {/* 월별 추세 라인차트 */}
      <Card className="p-5 md:p-6">
        <Caption>최근 6개월 추이</Caption>
        <h2 className="mt-1.5 text-lg font-bold tracking-tight text-ink-1 mb-3">소비 추이</h2>
        <MonthlyTrendChart data={data.monthly} currentKey={monthKey(new Date())} />
      </Card>

      {/* 카테고리별 */}
      <Card className="p-5 md:p-6">
        <Caption>카테고리 분포</Caption>
        <h2 className="mt-1.5 text-lg font-bold tracking-tight text-ink-1 mb-4">
          카테고리별 소비
        </h2>
        <div className="flex h-3 rounded-full overflow-hidden bg-surface-muted mb-4">
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
        <ul className="space-y-2.5 text-sm">
          {data.byCategory.map((c) => {
            const pct = ((c.total / totalCategorySum) * 100).toFixed(1);
            return (
              <li key={c.category} className="flex items-center justify-between gap-3 pb-2.5 border-b border-line last:border-b-0">
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="min-w-0">
                    <span className="block text-ink-1 font-semibold tracking-tight">{c.category}</span>
                    {c.unitAvgLabel && (
                      <span className="text-[11px] text-ink-3 tabular-nums">
                        평균 {c.unitAvgLabel}
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <Num value={c.total} size={13} weight={700} />
                  <span className="ml-2 text-xs text-ink-3 font-mono tabular-nums">{pct}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* 영수증별 거래 내역 */}
      <Card className="p-5 md:p-6">
        <Caption>거래 내역</Caption>
        <h2 className="mt-1.5 text-lg font-bold tracking-tight text-ink-1 mb-4">
          영수증별 내역
        </h2>
        {data.receipts.length === 0 ? (
          <div className="text-sm text-ink-3">영수증 등록 내역이 없어요.</div>
        ) : (
          <ul className="space-y-2">
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
                  className="border border-line rounded-xl overflow-hidden bg-surface"
                >
                  <details className="group">
                    <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-surface-muted list-none transition">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-ink-3 font-mono tabular-nums">{dateStr}</div>
                        <div className="font-semibold text-ink-1 truncate">
                          {r.chainName ? `${r.chainName} · ` : ""}
                          {r.storeName}
                        </div>
                        <div className="text-xs text-ink-3 tabular-nums">{r.items.length}개 품목</div>
                      </div>
                      <div className="text-right shrink-0">
                        <Num value={r.total} size={15} weight={700} />
                        <div className="text-[10px] text-ink-3 group-open:hidden">펼치기 ▾</div>
                        <div className="text-[10px] text-ink-3 hidden group-open:block">접기 ▴</div>
                      </div>
                    </summary>
                    <ul className="border-t border-line bg-surface-sunken/30">
                      {r.items.map((it, i) => (
                        <li
                          key={`${r.id}-${i}`}
                          className="px-4 py-2.5 text-sm border-b border-line/60 last:border-0"
                        >
                          {/* 모바일: 2행(상품명+가격 / 카테고리·수량·삭제). sm↑: 1행 */}
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              href={`/products/${it.productId}`}
                              className="hover:underline truncate min-w-0 text-ink-2 flex-1"
                            >
                              {it.name}
                            </Link>
                            <span className="font-semibold tabular-nums text-ink-1 shrink-0 min-w-[5ch] text-right">
                              {formatWon(it.lineTotal)}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <CategorySelect
                                productId={it.productId}
                                current={it.category}
                                isOverride={it.isOverride}
                              />
                              {it.quantity > 1 ? (
                                <span className="text-[11px] tabular-nums text-ink-3 shrink-0">
                                  {formatWon(it.price)} × {it.quantity}
                                </span>
                              ) : null}
                            </div>
                            <RemovePriceButton priceId={it.priceId} productName={it.name} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 더 싸게 살 수 있었던 Top 5 */}
      <Card className="p-5 md:p-6">
        <Caption>인사이트</Caption>
        <h2 className="mt-1.5 text-lg font-bold tracking-tight text-ink-1 mb-1">
          더 싸게 살 수 있었던 상품 Top 5
        </h2>
        <p className="text-xs text-ink-3 mb-4">
          본인이 산 정가 vs 등록된 최저 정가 (행사가는 비교에서 제외)
        </p>
        {data.overpaid.length === 0 ? (
          <div className="text-sm text-ink-3">
            축하합니다 — 모두 최저가로 사셨네요!
          </div>
        ) : (
          <ul className="space-y-2.5">
            {data.overpaid.map((o) => {
              const pct = Math.round((o.diff / o.minPrice) * 100);
              return (
                <li key={o.productId}>
                  <Link
                    href={`/products/${o.productId}`}
                    className="block bg-surface-muted hover:bg-surface-sunken/50 border border-line rounded-xl p-3.5 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ink-1 truncate">
                          {o.productName}
                        </div>
                        {o.minChainName && (
                          <div className="text-xs text-success-text mt-0.5 inline-flex items-center gap-1">
                            <StoreIcon size={11} />
                            <span className="font-medium">{o.minChainName}</span>
                            {o.minStoreName && o.minStoreName !== o.minChainName ? ` ${o.minStoreName}` : ""}
                            에서 더 싸요
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-danger-text font-bold text-sm tabular-nums">
                          +{formatWon(o.diff)}
                        </div>
                        <div className="text-xs text-ink-3 tabular-nums">
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
      </Card>
    </div>
  );
}
