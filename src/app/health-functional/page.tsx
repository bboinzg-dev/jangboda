import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import Pagination from "@/components/Pagination";

export const revalidate = 3600;

type TabKey = "category" | "rawmaterial";

const TAB_LABEL: Record<TabKey, string> = {
  category: "기능성 카테고리",
  rawmaterial: "원료",
};

const PAGE_SIZE = 30;

export default async function HealthFunctionalBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const tabParam = (sp.tab ?? "category") as TabKey;
  const tab: TabKey = tabParam === "rawmaterial" ? "rawmaterial" : "category";
  const q = (sp.q ?? "").trim();
  const page = Math.max(parseInt(sp.page ?? "1", 10) || 1, 1);

  let totalCategories = 0;
  let totalRawMaterials = 0;
  let filteredTotal = 0;
  let categories: Array<{
    id: string;
    groupCode: string;
    groupName: string;
    largeCategoryName: string | null;
    midCategoryName: string | null;
    smallCategoryName: string | null;
  }> = [];
  let rawMaterials: Array<{
    id: string;
    recognitionNo: string;
    rawMaterialName: string;
    weightUnit: string | null;
    dailyIntakeMin: string | null;
    dailyIntakeMax: string | null;
    primaryFunction: string | null;
  }> = [];

  try {
    [totalCategories, totalRawMaterials] = await Promise.all([
      prisma.healthFunctionalCategory.count(),
      prisma.healthFunctionalRawMaterial.count(),
    ]);

    if (tab === "category") {
      const where: Prisma.HealthFunctionalCategoryWhereInput = q
        ? { groupName: { contains: q, mode: "insensitive" } }
        : {};
      const [count, items] = await Promise.all([
        prisma.healthFunctionalCategory.count({ where }),
        prisma.healthFunctionalCategory.findMany({
          where,
          orderBy: [{ largeCategoryName: "asc" }, { groupName: "asc" }],
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            groupCode: true,
            groupName: true,
            largeCategoryName: true,
            midCategoryName: true,
            smallCategoryName: true,
          },
        }),
      ]);
      filteredTotal = count;
      categories = items;
    } else {
      const where: Prisma.HealthFunctionalRawMaterialWhereInput = q
        ? { rawMaterialName: { contains: q, mode: "insensitive" } }
        : {};
      const [count, items] = await Promise.all([
        prisma.healthFunctionalRawMaterial.count({ where }),
        prisma.healthFunctionalRawMaterial.findMany({
          where,
          orderBy: { rawMaterialName: "asc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          select: {
            id: true,
            recognitionNo: true,
            rawMaterialName: true,
            weightUnit: true,
            dailyIntakeMin: true,
            dailyIntakeMax: true,
            primaryFunction: true,
          },
        }),
      ]);
      filteredTotal = count;
      rawMaterials = items;
    }
  } catch (e) {
    console.error("[health-functional] page load error:", e);
  }

  const totalPages = Math.max(Math.ceil(filteredTotal / PAGE_SIZE), 1);
  const safePage = Math.min(page, totalPages);

  // 페이지네이션 링크 빌더 — 현재 tab + q 보존
  const buildHref = (p: number) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    return `/health-functional?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-ink-1 flex items-center gap-2">
          🌿 건강기능식품 정보
        </h1>
        <p className="text-sm text-ink-3">
          식약처 건강기능식품 DB(영양카테고리·개별인정형 원료) 검색.
        </p>
      </header>

      <nav className="flex gap-2 border-b border-line">
        {(Object.keys(TAB_LABEL) as TabKey[]).map((k) => {
          const active = k === tab;
          const total = k === "category" ? totalCategories : totalRawMaterials;
          // 탭 변경 시 page는 자연스럽게 1로 리셋(미포함). 검색어 q는 보존.
          const href = `/health-functional?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
          return (
            <Link
              key={k}
              href={href}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                active
                  ? "border-success text-success-text"
                  : "border-transparent text-ink-4 hover:text-ink-2"
              }`}
            >
              {TAB_LABEL[k]}
              <span className="ml-1 text-xs text-ink-4">({total}건)</span>
            </Link>
          );
        })}
      </nav>

      {/* 검색 폼 — 탭 보존, page는 자동 리셋 */}
      <form method="GET" action="/health-functional" className="flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <input
          name="q"
          defaultValue={q}
          placeholder={
            tab === "category"
              ? "기능성 그룹명 검색 (예: 면역, 장)"
              : "원료명 검색 (예: 프로바이오틱스, 오메가-3)"
          }
          className="flex-1 rounded-lg border border-line-strong px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-success hover:bg-success text-white px-4 py-2 text-sm font-medium"
        >
          검색
        </button>
      </form>

      <div className="text-xs text-ink-4">
        총 {filteredTotal.toLocaleString()}건
        {q && ` · "${q}"`}
      </div>

      {tab === "category" ? (
        <CategoryList items={categories} q={q} />
      ) : (
        <RawMaterialList items={rawMaterials} q={q} />
      )}

      <Pagination
        currentPage={safePage}
        totalPages={totalPages}
        buildHref={buildHref}
      />

      <p className="text-[11px] text-ink-4 leading-relaxed">
        출처: 식약처 건강기능식품 DB(I0760·I-0050). 본 정보는 참고용이며 실제 제품
        표시와 다를 수 있습니다.
      </p>
    </div>
  );
}

function CategoryList({
  items,
  q,
}: {
  items: Array<{
    id: string;
    groupCode: string;
    groupName: string;
    largeCategoryName: string | null;
    midCategoryName: string | null;
    smallCategoryName: string | null;
  }>;
  q: string;
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-ink-4 bg-surface-muted rounded-lg p-4">
        {q ? `"${q}" 검색 결과가 없습니다.` : "데이터가 없습니다."}
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((c) => (
        <li
          key={c.id}
          className="border border-line rounded-lg p-3 bg-surface"
        >
          <div className="font-medium text-ink-1 text-sm">{c.groupName}</div>
          <div className="text-[11px] text-ink-4 mt-0.5">
            {[c.largeCategoryName, c.midCategoryName, c.smallCategoryName]
              .filter(Boolean)
              .join(" › ") || "-"}
          </div>
          <div className="text-[10px] text-ink-4 mt-1">
            그룹코드: {c.groupCode}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RawMaterialList({
  items,
  q,
}: {
  items: Array<{
    id: string;
    recognitionNo: string;
    rawMaterialName: string;
    weightUnit: string | null;
    dailyIntakeMin: string | null;
    dailyIntakeMax: string | null;
    primaryFunction: string | null;
  }>;
  q: string;
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-ink-4 bg-surface-muted rounded-lg p-4">
        {q ? `"${q}" 검색 결과가 없습니다.` : "데이터가 없습니다."}
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((rm) => {
        const u = rm.weightUnit ?? "";
        const intake =
          rm.dailyIntakeMin && rm.dailyIntakeMax
            ? `${rm.dailyIntakeMin} ~ ${rm.dailyIntakeMax}${u}`
            : rm.dailyIntakeMin
            ? `최소 ${rm.dailyIntakeMin}${u}`
            : rm.dailyIntakeMax
            ? `최대 ${rm.dailyIntakeMax}${u}`
            : null;
        return (
          <li
            key={rm.id}
            className="border border-line rounded-lg p-3 bg-surface"
          >
            <div className="font-medium text-ink-1 text-sm">
              {rm.rawMaterialName}
            </div>
            {rm.primaryFunction && (
              <div className="mt-1 text-xs text-ink-3 leading-relaxed">
                {rm.primaryFunction}
              </div>
            )}
            {intake && (
              <div className="text-[11px] text-ink-4 mt-1">
                일일 섭취량: {intake}
              </div>
            )}
            <div className="text-[10px] text-ink-4 mt-1">
              인정번호: {rm.recognitionNo}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
