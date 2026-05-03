import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { formatWon } from "@/lib/format";
import EmptyState from "@/components/EmptyState";

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

type BudgetData = {
  thisMonthTotal: number;
  monthly: { key: string; total: number }[];
  byCategory: { category: string; total: number }[];
  byStore: { storeName: string; chainName: string; total: number }[];
  overpaid: {
    productId: string;
    productName: string;
    paid: number;
    minPrice: number;
    diff: number;
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

  // 이번 달 합계
  const now = new Date();
  const curKey = monthKey(now);
  const thisMonthTotal = valid
    .filter((p) => monthKey(p.createdAt) === curKey)
    .reduce((s, p) => s + p.price, 0);

  // 최근 6개월 월별 합계
  const keys = recentMonthKeys(6);
  const monthlyMap = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const p of valid) {
    const k = monthKey(p.createdAt);
    if (monthlyMap.has(k)) {
      monthlyMap.set(k, (monthlyMap.get(k) ?? 0) + p.price);
    }
  }
  const monthly = keys.map((k) => ({ key: k, total: monthlyMap.get(k) ?? 0 }));

  // 카테고리별
  const catMap = new Map<string, number>();
  for (const p of valid) {
    const c = p.product?.category ?? "기타";
    catMap.set(c, (catMap.get(c) ?? 0) + p.price);
  }
  const byCategory = Array.from(catMap.entries())
    .map(([category, total]) => ({ category, total }))
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
    cur.total += p.price;
    storeMap.set(key, cur);
  }
  const byStore = Array.from(storeMap.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // 평균보다 비싸게 산 Top 5 — 같은 product의 최저가 vs 본인이 산 가격
  const productIds = Array.from(new Set(valid.map((p) => p.productId)));
  const minByProduct = new Map<string, number>();
  if (productIds.length > 0) {
    const allMins = await prisma.price.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds } },
      _min: { price: true },
    });
    for (const r of allMins) {
      if (r._min.price != null) minByProduct.set(r.productId, r._min.price);
    }
  }

  // 본인이 산 가격 중 가장 비싼 것 vs 최저가 비교 — 같은 상품 여러 번이면 최고가 사용
  const myMaxByProduct = new Map<string, { paid: number; productName: string }>();
  for (const p of valid) {
    const cur = myMaxByProduct.get(p.productId);
    if (!cur || p.price > cur.paid) {
      myMaxByProduct.set(p.productId, {
        paid: p.price,
        productName: p.product?.name ?? "(이름 없음)",
      });
    }
  }
  const overpaid = Array.from(myMaxByProduct.entries())
    .map(([productId, v]) => {
      const minPrice = minByProduct.get(productId) ?? v.paid;
      return {
        productId,
        productName: v.productName,
        paid: v.paid,
        minPrice,
        diff: v.paid - minPrice,
      };
    })
    .filter((x) => x.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 5);

  return {
    thisMonthTotal,
    monthly,
    byCategory,
    byStore,
    overpaid,
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

  // 카테고리별 색상 팔레트 (Tailwind safe)
  const palette = [
    "bg-rose-400",
    "bg-amber-400",
    "bg-emerald-400",
    "bg-sky-400",
    "bg-violet-400",
    "bg-pink-400",
    "bg-lime-400",
    "bg-stone-400",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">가계부</h1>
        <Link
          href="/upload"
          className="text-sm text-brand-600 hover:underline"
        >
          + 영수증 추가
        </Link>
      </div>

      {/* 이번 달 합계 */}
      <header className="bg-gradient-to-br from-brand-50 to-brand-100 border border-brand-200 rounded-xl p-6">
        <div className="text-xs text-brand-700 font-medium">
          이번 달 ({new Date().getMonth() + 1}월) 소비
        </div>
        <div className="text-3xl font-bold text-brand-700 mt-1">
          {formatWon(data.thisMonthTotal)}
        </div>
        <div className="text-xs text-stone-500 mt-1">
          총 {data.totalCount}건의 가격 기록 기반
        </div>
      </header>

      {/* 월별 막대 그래프 */}
      <section className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="font-bold mb-3">최근 6개월 소비 추이</h2>
        <div className="flex items-end gap-2 h-40">
          {data.monthly.map((m) => {
            const h = (m.total / maxMonthly) * 100;
            const labelMonth = m.key.split("-")[1];
            const isCurrent = m.key === monthKey(new Date());
            return (
              <div
                key={m.key}
                className="flex-1 flex flex-col items-center gap-1 min-w-0"
              >
                <div className="text-[10px] text-stone-500 truncate w-full text-center">
                  {m.total > 0 ? formatWon(m.total) : "-"}
                </div>
                <div className="w-full bg-stone-100 rounded-t flex items-end h-full">
                  <div
                    className={`w-full rounded-t transition-all ${
                      isCurrent ? "bg-brand-500" : "bg-brand-300"
                    }`}
                    style={{ height: `${Math.max(h, 2)}%` }}
                    aria-label={`${m.key} ${m.total}원`}
                  />
                </div>
                <div className="text-xs text-stone-600">{labelMonth}월</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 카테고리별 */}
      <section className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="font-bold mb-3">카테고리별 소비</h2>
        {/* 가로 도넛-대용 스택 바 */}
        <div className="flex h-3 rounded-full overflow-hidden bg-stone-100 mb-4">
          {data.byCategory.slice(0, 8).map((c, i) => {
            const pct = (c.total / totalCategorySum) * 100;
            return (
              <div
                key={c.category}
                className={palette[i % palette.length]}
                style={{ width: `${pct}%` }}
                title={`${c.category}: ${formatWon(c.total)}`}
              />
            );
          })}
        </div>
        <ul className="space-y-1.5 text-sm">
          {data.byCategory.slice(0, 8).map((c, i) => {
            const pct = ((c.total / totalCategorySum) * 100).toFixed(1);
            return (
              <li
                key={c.category}
                className="flex items-center justify-between"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      palette[i % palette.length]
                    }`}
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
                  className="flex items-center justify-between text-sm border-b border-stone-100 last:border-0 pb-2 last:pb-0"
                >
                  <Link
                    href={`/products/${o.productId}`}
                    className="hover:underline truncate min-w-0"
                  >
                    {o.productName}
                  </Link>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-rose-600 font-bold">
                      +{formatWon(o.diff)}
                    </div>
                    <div className="text-xs text-stone-500">
                      산값 {formatWon(o.paid)} / 최저 {formatWon(o.minPrice)} (+
                      {pct}%)
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
