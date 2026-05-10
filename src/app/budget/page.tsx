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
import { budgetCategoryOf, CATEGORY_COLORS, type BudgetCategory } from "@/lib/budgetCategory";
import { generateInsights } from "@/lib/budgetInsights";
import { unitPriceValue, unitBasisLabel } from "@/lib/units";
import { kstMonthKey, kstNow } from "@/lib/kst";

export const dynamic = "force-dynamic";

// 월 키 (YYYY-MM) 생성 — KST 기준
const monthKey = kstMonthKey;

// 최근 N개월의 월 키 배열 (오래된 → 최신) — KST 기준
function recentMonthKeys(n: number): string[] {
  const now = kstNow();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    // UTC 메서드 사용 (kstNow의 timestamp는 +9h 보정돼 있어 UTC 메서드가 KST 값)
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
    lastYearTotal: number;         // 작년 같은 달 지출
    yearDeltaPct: number | null;   // 작년 동월 대비 변화율
    savedAmount: number;           // 행사가로 산 누적 절약액 = Σ(listPrice - paidPrice) × 수량
    promoCount: number;            // 행사가로 구매한 건수
    promoBase: number;             // listPrice가 있는 행 = "행사 활용률" 분모
    totalPriceCount: number;       // 전체 등록 건수
    storeCount: number;            // 다녀본 매장 수
  };
  monthly: { key: string; total: number }[];
  byCategory: {
    category: BudgetCategory;
    total: number;
    color: string;
    /** 카테고리 안에서 가장 흔한 baseUnit으로 계산한 평균 단가 (예: "100g당 1,234원") */
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
  frequentProducts: FrequentProduct[];  // 자주 사는 상품 + 곧 살 때
  receipts: {
    id: string;
    storeName: string;
    chainName: string;
    date: Date;
    total: number;
    items: {
      productId: string;
      name: string;
      price: number;       // 단가 (정가 또는 행사가)
      quantity: number;    // metadata.quantity (옛 데이터는 1)
      lineTotal: number;   // 단가 × 수량 — 영수증 합계 산출용
      category: string;
      isOverride: boolean;
    }[];
  }[];
  totalCount: number;
};

async function getBudget(userId: string): Promise<BudgetData & { overrides: Record<string, string> }> {
  // 사용자별 카테고리 override 로드 — 자동 분류 정정용
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { budgetCategoryOverrides: true },
  });
  const overrides = (userRow?.budgetCategoryOverrides as Record<string, string>) ?? {};

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
      product: { select: { id: true, name: true, category: true, unit: true } },
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

  // 영수증의 quantity는 Price 컬럼이 아니라 metadata.quantity 로 보존 (수량 컬럼 없는 스키마).
  // 신규 영수증부터만 보존되므로 기존 데이터는 quantity=1로 fallback.
  const quantityOf = (p: { metadata: unknown }) => {
    const m = p.metadata as { quantity?: number } | null | undefined;
    const q = m?.quantity;
    return typeof q === "number" && q > 1 ? q : 1;
  };
  // 사용자가 실제 지불한 총액 = (행사가 ?? 정가) × 수량.
  // 단가 합산만 하면 같은 상품 N개 구매가 1개 값으로 들어가는 버그 → quantity 반영.
  const paidOf = (p: {
    paidPrice: number | null;
    listPrice: number | null;
    metadata: unknown;
  }) => (p.paidPrice ?? p.listPrice ?? 0) * quantityOf(p);
  // 시장 비교용 정가 단가 (× 수량) — overpaid 계산을 listPrice 기준으로 통일하기 위해 사용
  const listPaidOf = (p: { listPrice: number | null; metadata: unknown }) =>
    (p.listPrice ?? 0) * quantityOf(p);

  // 이번 달 / 지난 달 합계 — KPI 비교용 (KST 기준)
  const now = kstNow();
  const curKey = monthKey(new Date()); // monthKey 자체가 KST 보정
  const lastMonthDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
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

  // 누적 절약액 — 행사가로 산 모든 건의 (listPrice - paidPrice) × 수량 합산.
  // 사용자에게 "행사 활용으로 N원 아꼈어요" 보상감 신호.
  let savedAmount = 0;
  let promoCount = 0;
  let promoBase = 0; // listPrice가 있는 행만 분모로 — "행사 활용률" 의미를 정확히
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

  // 최근 12개월 월별 합계 — 연도별 추세 + 작년 동월 비교용
  const keys = recentMonthKeys(12);
  const monthlyMap = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const p of valid) {
    const k = monthKey(p.createdAt);
    if (monthlyMap.has(k)) {
      monthlyMap.set(k, (monthlyMap.get(k) ?? 0) + paidOf(p));
    }
  }
  const monthly = keys.map((k) => ({ key: k, total: monthlyMap.get(k) ?? 0 }));

  // 작년 동월 비교 — 13개월 데이터까지 검사 (이번 달과 같은 월의 작년 데이터, KST 기준)
  const lastYearKey = `${now.getUTCFullYear() - 1}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const lastYearTotal = valid
    .filter((p) => monthKey(p.createdAt) === lastYearKey)
    .reduce((s, p) => s + paidOf(p), 0);
  const yearDeltaPct =
    lastYearTotal > 0
      ? Math.round(((thisMonthTotal - lastYearTotal) / lastYearTotal) * 100)
      : null;

  // 카테고리별 — 메가 카테고리(신선식품/유제품/가공즉석/음료/...)로 정상화
  // 사용자 override가 있으면 그걸 우선 (잘못 분류된 product를 사용자가 수동 정정 가능)
  const resolveCategory = (productId: string, name: string, productCat?: string | null) => {
    const ov = overrides[productId];
    if (ov) return ov as BudgetCategory;
    return budgetCategoryOf(name, productCat);
  };
  // 카테고리별 총액 + baseUnit 별 단가 샘플 수집
  // 이유: 한 카테고리 안에 g/ml/count 가 섞여 있어서, 가장 흔한 baseUnit으로만 평균을 내야 의미가 있음
  type CatBucket = {
    total: number;
    unitSamples: Map<string, number[]>; // basisLabel → [unit prices...]
  };
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
      // 가장 샘플 많은 basisLabel 1개만 사용 — 표본 3건 미만은 표시 안 함 (오차 큼)
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
      return {
        category,
        total: bucket.total,
        color: CATEGORY_COLORS[category],
        unitAvgLabel,
      };
    })
    .sort((a, b) => b.total - a.total);

  // 매장별 상위 5
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

  // 본인이 산 정가 단가 중 최대 vs 시장 정가 최저 — listPrice 기준으로 통일.
  // (옛 코드는 본인 paidPrice(행사가) vs 시장 listPrice(정가) 비교라 행사가로 잘 산 경우도
  //  "더 비싸게 샀다"고 표시되던 부조화 → 본인도 listPrice 기준으로 맞춤)
  const myMaxByProduct = new Map<
    string,
    { listPrice: number; productName: string }
  >();
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
        include: { product: { select: { id: true, name: true, category: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50, // 최근 50건
  });

  const receipts = myReceipts.map((r) => {
    const items = r.prices.map((p) => {
      const cat = resolveCategory(
        p.productId,
        p.product?.name ?? "",
        p.product?.category,
      );
      const unit = p.paidPrice ?? p.listPrice ?? 0;
      const q = quantityOf(p);
      return {
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

  const totalCategorySum = data.byCategory.reduce((s, c) => s + c.total, 0) || 1;
  // "행사 활용률" — listPrice가 있는 행만 분모. totalPriceCount(전체) 분모는 의미가 흐릿했음.
  const promoRate =
    data.kpi.promoBase > 0
      ? Math.round((data.kpi.promoCount / data.kpi.promoBase) * 100)
      : 0;
  const insights = generateInsights(data);
  const monthLabel = kstNow().getUTCMonth() + 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink-1 tracking-tight">
            가계부
          </h1>
          <p className="text-sm text-ink-3 mt-0.5">
            영수증으로 만든 내 소비 분석
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="/api/budget/export"
            download
            className="text-sm border border-line text-ink-2 hover:bg-surface-muted px-3 py-1.5 rounded-xl font-medium inline-flex items-center gap-1"
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
            className="text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-1.5 rounded-xl font-medium shadow-soft hover:shadow-raise transition"
          >
            + 영수증 추가
          </Link>
        </div>
      </div>

      {/* KPI 헤더 — 메인(이번 달) 1개 크게 + 보조 3개.
          예전 4색 컨피티(brand/emerald/rose/sky)는 위계가 없어 시선이 분산됐음.
          이제 메인만 강조하고 보조는 흰 카드 + 색 액센트 1줄. */}
      <header className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. 이번 달 지출 — primary, md에서 2칸 차지 */}
        <div className="md:col-span-2 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl p-5 md:p-6 text-white shadow-raise">
          <div className="text-xs md:text-sm text-white/80 font-medium">
            이번 달 ({monthLabel}월) 지출
          </div>
          <div className="text-3xl md:text-4xl font-extrabold mt-1 tabular-nums tracking-tight">
            {formatWon(data.kpi.thisMonth)}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs md:text-sm text-white/90">
            {data.kpi.monthDeltaPct !== null && (
              <span>
                지난달{" "}
                <span className="font-semibold">
                  {data.kpi.monthDeltaPct > 0 ? "▲" : data.kpi.monthDeltaPct < 0 ? "▼" : "─"}
                  {Math.abs(data.kpi.monthDeltaPct)}%
                </span>{" "}
                <span className="text-white/70 tabular-nums">
                  ({formatWon(data.kpi.lastMonth)})
                </span>
              </span>
            )}
            {data.kpi.yearDeltaPct !== null && (
              <span>
                작년 {monthLabel}월{" "}
                <span className="font-semibold">
                  {data.kpi.yearDeltaPct > 0 ? "▲" : data.kpi.yearDeltaPct < 0 ? "▼" : "─"}
                  {Math.abs(data.kpi.yearDeltaPct)}%
                </span>{" "}
                <span className="text-white/70 tabular-nums">
                  ({formatWon(data.kpi.lastYearTotal)})
                </span>
              </span>
            )}
            {data.kpi.monthDeltaPct === null && data.kpi.yearDeltaPct === null && (
              <span className="text-white/70">비교할 과거 데이터 누적 중</span>
            )}
          </div>
        </div>

        {/* 보조 KPI 3개 — 한 묶음으로 grid */}
        <div className="grid grid-cols-3 md:grid-cols-1 gap-3">
          <div className="kpi-card text-success-text">
            <div className="text-[11px] font-medium text-ink-3">누적 절약</div>
            <div className="text-lg md:text-xl font-extrabold mt-0.5 tabular-nums tracking-tight text-success-text">
              {formatWon(data.kpi.savedAmount)}
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5">
              행사가로 아낀 합계
            </div>
          </div>
          <div className="kpi-card text-danger-text">
            <div className="text-[11px] font-medium text-ink-3">행사 활용률</div>
            <div className="text-lg md:text-xl font-extrabold mt-0.5 tabular-nums tracking-tight text-ink-1">
              {promoRate}
              <span className="text-sm text-ink-3 font-semibold">%</span>
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5 tabular-nums">
              {data.kpi.promoCount}/{data.kpi.promoBase}건
            </div>
          </div>
          <div className="kpi-card text-info-text">
            <div className="text-[11px] font-medium text-ink-3">다녀본 매장</div>
            <div className="text-lg md:text-xl font-extrabold mt-0.5 tabular-nums tracking-tight text-ink-1">
              {data.kpi.storeCount}
              <span className="text-sm text-ink-3 font-semibold">곳</span>
            </div>
            <div className="text-[11px] text-ink-3 mt-0.5 tabular-nums">
              총 {data.totalCount}건
            </div>
          </div>
        </div>
      </header>

      {/* 월 예산 진행률 — 미설정 시 "예산 설정" CTA, 설정 시 진행률 바 */}
      <BudgetGoalCard thisMonth={data.kpi.thisMonth} />

      {/* 자동 인사이트 — 룰 기반으로 데이터에서 발견한 멘트 */}
      {insights.length > 0 && (
        <section className="card p-5 md:p-6">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <span aria-hidden>💡</span> 오늘의 발견
            <span className="text-xs text-ink-3 font-normal">
              {insights.length}건
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
        <section className="card p-5 md:p-6">
          <h2 className="section-title mb-3 flex items-center gap-2">
            자주 사는 상품
            <span className="text-xs text-ink-3 font-normal">
              {data.frequentProducts.length}건
            </span>
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.frequentProducts.map((fp) => (
              <li key={fp.productId}>
                <Link
                  href={`/products/${fp.productId}`}
                  className="group block bg-surface-muted/50 hover:bg-surface-muted border border-line/60 rounded-xl p-3 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-ink-1 truncate">
                          {fp.productName}
                        </span>
                        {fp.isDue && (
                          <span className="badge-danger shrink-0">
                            곧 살 때
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-3 mt-1 flex items-center gap-2 flex-wrap tabular-nums">
                        <span>
                          {fp.count}회 · 마지막{" "}
                          <span className="font-medium text-ink-2">{fp.daysSinceLast}일 전</span>
                        </span>
                        {fp.avgInterval !== null && (
                          <span>· 평균 {fp.avgInterval}일</span>
                        )}
                      </div>
                    </div>
                    <span className="text-ink-3 shrink-0 group-hover:text-brand-500 transition">›</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 월별 추세 라인차트 — SVG (recharts 안 씀, 번들 보호) */}
      <section className="card p-5 md:p-6">
        <h2 className="section-title mb-3">최근 6개월 소비 추이</h2>
        <MonthlyTrendChart data={data.monthly} currentKey={monthKey(new Date())} />
      </section>

      {/* 카테고리별 — 메가 카테고리(신선식품/유제품/음료/...) 정상화 */}
      <section className="card p-5 md:p-6">
        <h2 className="section-title mb-3">카테고리별 소비</h2>
        {/* 가로 스택 바 */}
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
        <ul className="space-y-1.5 text-sm">
          {data.byCategory.map((c) => {
            const pct = ((c.total / totalCategorySum) * 100).toFixed(1);
            return (
              <li
                key={c.category}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="min-w-0">
                    <span className="truncate text-ink-2 block">{c.category}</span>
                    {c.unitAvgLabel && (
                      <span className="text-[11px] text-ink-3 tabular-nums">
                        평균 {c.unitAvgLabel}
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-ink-2 shrink-0 ml-3 tabular-nums text-right">
                  {formatWon(c.total)}{" "}
                  <span className="text-xs text-ink-3">({pct}%)</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 영수증별 거래 내역 — 언제·어디서·무엇 */}
      <section className="card p-5 md:p-6">
        <h2 className="section-title mb-3">영수증별 거래 내역</h2>
        {data.receipts.length === 0 ? (
          <div className="text-sm text-ink-3">
            영수증 등록 내역이 없어요.
          </div>
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
                  className="border border-line/70 rounded-xl overflow-hidden bg-white"
                >
                  <details className="group">
                    <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-surface-muted/60 list-none transition">
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] text-ink-3 tabular-nums">{dateStr}</div>
                        <div className="font-semibold text-ink-1 truncate">
                          {r.chainName ? `${r.chainName} · ` : ""}
                          {r.storeName}
                        </div>
                        <div className="text-xs text-ink-3 tabular-nums">
                          {r.items.length}개 품목
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold tabular-nums text-ink-1">
                          {formatWon(r.total)}
                        </div>
                        <div className="text-[10px] text-ink-3 group-open:hidden">
                          펼치기 ▾
                        </div>
                        <div className="text-[10px] text-ink-3 hidden group-open:block">
                          접기 ▴
                        </div>
                      </div>
                    </summary>
                    <ul className="border-t border-line/60 bg-surface-muted/30">
                      {r.items.map((it, i) => (
                        <li
                          key={`${r.id}-${i}`}
                          className="flex items-center justify-between gap-2 px-4 py-2 text-sm border-b border-line/40 last:border-0"
                        >
                          <Link
                            href={`/products/${it.productId}`}
                            className="hover:underline truncate min-w-0 text-ink-2 flex-1"
                          >
                            {it.name}
                          </Link>
                          <CategorySelect
                            productId={it.productId}
                            current={it.category}
                            isOverride={it.isOverride}
                          />
                          {/* 수량 N>1 일 때만 단가 × 수량 표기 — 영수증 합계 검증 가능 */}
                          {it.quantity > 1 ? (
                            <span className="text-[11px] tabular-nums text-ink-3 shrink-0">
                              {formatWon(it.price)} × {it.quantity}
                            </span>
                          ) : null}
                          <span className="font-semibold tabular-nums text-ink-1 shrink-0 min-w-[5ch] text-right">
                            {formatWon(it.lineTotal)}
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
      <section className="card p-5 md:p-6">
        <h2 className="section-title mb-3">매장별 소비 Top 5</h2>
        {data.byStore.length === 0 ? (
          <div className="text-sm text-ink-3">매장 데이터 없음</div>
        ) : (
          <ul className="space-y-1">
            {data.byStore.map((s, idx) => {
              const pct = Math.round((s.total / (data.byStore[0]?.total || 1)) * 100);
              return (
                <li
                  key={s.storeId}
                  className="flex items-center gap-3 py-2 border-b border-line/40 last:border-0"
                >
                  <span className="w-5 text-center text-xs font-bold text-ink-3 tabular-nums shrink-0">
                    {idx + 1}
                  </span>
                  <FavoriteToggle storeId={s.storeId} size="sm" />
                  <Link
                    href={`/stores/${s.storeId}`}
                    className="min-w-0 flex-1 group"
                  >
                    <div className="font-semibold text-ink-1 truncate group-hover:text-brand-600 transition">
                      {s.chainName}
                    </div>
                    <div className="text-xs text-ink-3 truncate">
                      {s.storeName}
                    </div>
                    {/* 1위 대비 막대 */}
                    <div className="mt-1 h-1 bg-surface-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400/70 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                  <div className="font-bold text-ink-1 shrink-0 tabular-nums">
                    {formatWon(s.total)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 더 싸게 살 수 있었던 Top 5 — 본인 정가 vs 시장 정가 (행사가 비교 아님) */}
      <section className="card p-5 md:p-6">
        <h2 className="section-title mb-1">더 싸게 살 수 있었던 상품 Top 5</h2>
        <p className="text-xs text-ink-3 mb-3">
          본인이 산 정가 vs 등록된 최저 정가 (행사가는 비교에서 제외)
        </p>
        {data.overpaid.length === 0 ? (
          <div className="text-sm text-ink-3">
            축하합니다 — 모두 최저가로 사셨네요!
          </div>
        ) : (
          <ul className="space-y-2">
            {data.overpaid.map((o) => {
              const pct = Math.round((o.diff / o.minPrice) * 100);
              return (
                <li key={o.productId}>
                  <Link
                    href={`/products/${o.productId}`}
                    className="block bg-surface-muted/40 hover:bg-surface-muted border border-line/50 rounded-xl p-3 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ink-1 truncate">
                          {o.productName}
                        </div>
                        {o.minChainName && (
                          <div className="text-xs text-success-text mt-0.5">
                            <span className="font-medium">{o.minChainName}</span>
                            {o.minStoreName && o.minStoreName !== o.minChainName ? ` ${o.minStoreName}` : ""}
                            에서 더 싸게 살 수 있어요
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
      </section>
    </div>
  );
}
