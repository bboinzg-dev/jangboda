import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const revalidate = 3600;

type TabKey = "category" | "rawmaterial";

const TAB_LABEL: Record<TabKey, string> = {
  category: "기능성 카테고리",
  rawmaterial: "원료",
};

export default async function HealthFunctionalBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const tabParam = (sp.tab ?? "category") as TabKey;
  const tab: TabKey = tabParam === "rawmaterial" ? "rawmaterial" : "category";
  const q = (sp.q ?? "").trim();

  let totalCategories = 0;
  let totalRawMaterials = 0;
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
      categories = await prisma.healthFunctionalCategory.findMany({
        where,
        orderBy: [{ largeCategoryName: "asc" }, { groupName: "asc" }],
        take: 200,
        select: {
          id: true,
          groupCode: true,
          groupName: true,
          largeCategoryName: true,
          midCategoryName: true,
          smallCategoryName: true,
        },
      });
    } else {
      const where: Prisma.HealthFunctionalRawMaterialWhereInput = q
        ? { rawMaterialName: { contains: q, mode: "insensitive" } }
        : {};
      rawMaterials = await prisma.healthFunctionalRawMaterial.findMany({
        where,
        orderBy: { rawMaterialName: "asc" },
        take: 200,
        select: {
          id: true,
          recognitionNo: true,
          rawMaterialName: true,
          weightUnit: true,
          dailyIntakeMin: true,
          dailyIntakeMax: true,
          primaryFunction: true,
        },
      });
    }
  } catch (e) {
    console.error("[health-functional] page load error:", e);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
          🌿 건강기능식품 정보
        </h1>
        <p className="text-sm text-stone-600">
          식약처 건강기능식품 DB(영양카테고리·개별인정형 원료) 검색.
        </p>
      </header>

      <nav className="flex gap-2 border-b border-stone-200">
        {(Object.keys(TAB_LABEL) as TabKey[]).map((k) => {
          const active = k === tab;
          const total = k === "category" ? totalCategories : totalRawMaterials;
          const href = `/health-functional?tab=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
          return (
            <Link
              key={k}
              href={href}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                active
                  ? "border-emerald-500 text-emerald-700"
                  : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              {TAB_LABEL[k]}
              <span className="ml-1 text-xs text-stone-400">({total}건)</span>
            </Link>
          );
        })}
      </nav>

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
          className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-medium"
        >
          검색
        </button>
      </form>

      {tab === "category" ? (
        <CategoryList items={categories} q={q} />
      ) : (
        <RawMaterialList items={rawMaterials} q={q} />
      )}

      <p className="text-[11px] text-stone-400 leading-relaxed">
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
      <div className="text-sm text-stone-500 bg-stone-50 rounded-lg p-4">
        {q ? `"${q}" 검색 결과가 없습니다.` : "데이터가 없습니다."}
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((c) => (
        <li
          key={c.id}
          className="border border-stone-200 rounded-lg p-3 bg-white"
        >
          <div className="font-medium text-stone-900 text-sm">{c.groupName}</div>
          <div className="text-[11px] text-stone-500 mt-0.5">
            {[c.largeCategoryName, c.midCategoryName, c.smallCategoryName]
              .filter(Boolean)
              .join(" › ") || "-"}
          </div>
          <div className="text-[10px] text-stone-400 mt-1">
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
      <div className="text-sm text-stone-500 bg-stone-50 rounded-lg p-4">
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
            className="border border-stone-200 rounded-lg p-3 bg-white"
          >
            <div className="font-medium text-stone-900 text-sm">
              {rm.rawMaterialName}
            </div>
            {rm.primaryFunction && (
              <div className="mt-1 text-xs text-stone-600 leading-relaxed">
                {rm.primaryFunction}
              </div>
            )}
            {intake && (
              <div className="text-[11px] text-stone-500 mt-1">
                일일 섭취량: {intake}
              </div>
            )}
            <div className="text-[10px] text-stone-400 mt-1">
              인정번호: {rm.recognitionNo}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
