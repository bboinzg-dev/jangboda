"use client";

import { useEffect, useState } from "react";

type Category = {
  id: string;
  groupCode: string;
  groupName: string;
  largeCategoryName: string | null;
  midCategoryName: string | null;
  smallCategoryName: string | null;
};

type RawMaterial = {
  id: string;
  recognitionNo: string;
  rawMaterialName: string;
  weightUnit: string | null;
  dailyIntakeMin: string | null;
  dailyIntakeMax: string | null;
  primaryFunction: string | null;
  warning: string | null;
};

type HealthFunctionalResponse = {
  categories: Category[];
  rawMaterials: RawMaterial[];
};

type Props = {
  productId: string;
  productName: string;
  productCategory?: string | null;
};

// 건강기능식품 카테고리 제품을 위한 패널.
// productName 기반으로 /api/health-functional 검색 → 매칭 결과 표시.
// 매칭 0건 + 카테고리도 건기식 아니면 아무것도 렌더하지 않음 (일반 상품 페이지 오염 방지).
export default function HealthFunctionalPanel({
  productId,
  productName,
  productCategory,
}: Props) {
  const [data, setData] = useState<HealthFunctionalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openWarnings, setOpenWarnings] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // productName에서 검색용 키워드 추출 — 너무 짧거나 흔한 단어는 매칭 정확도 낮음
    const q = productName.trim();
    if (!q) {
      setData({ categories: [], rawMaterials: [] });
      setLoading(false);
      return;
    }

    fetch(`/api/health-functional?q=${encodeURIComponent(q)}&limit=20`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: HealthFunctionalResponse | null) => {
        if (cancelled) return;
        setData(j ?? { categories: [], rawMaterials: [] });
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData({ categories: [], rawMaterials: [] });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // productId는 내부적으론 안 쓰지만 props로 받았으므로 의존 배열에서만 참조
  }, [productName, productId]);

  const isHealthFunctional =
    !!productCategory &&
    (productCategory.includes("건기식") || productCategory.includes("건강기능"));

  if (loading) {
    // 건강기능식품 카테고리일 때만 로딩 placeholder 표시
    if (!isHealthFunctional) return null;
    return (
      <section className="bg-white border border-stone-200 rounded-xl p-4">
        <div className="text-sm text-stone-500">
          건강기능 정보를 불러오는 중…
        </div>
      </section>
    );
  }

  const categories = data?.categories ?? [];
  const rawMaterials = data?.rawMaterials ?? [];
  const noMatches = categories.length === 0 && rawMaterials.length === 0;

  // 매칭 0건 + 일반 상품 → 패널 자체 미표시
  if (noMatches && !isHealthFunctional) return null;

  function toggleWarning(id: string) {
    setOpenWarnings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className="bg-white border border-stone-200 rounded-xl p-5 space-y-4">
      <header className="space-y-1">
        <h2 className="font-bold text-stone-900 flex items-center gap-2">
          🌿 이 제품과 관련된 건강기능 정보
        </h2>
        <p className="text-xs text-stone-500">
          식약처 건강기능식품 DB(I0760·I-0050)에서 제품명으로 매칭한 결과입니다.
        </p>
      </header>

      {noMatches ? (
        <div className="text-sm text-stone-500 bg-stone-50 rounded-lg p-3">
          관련된 건강기능 정보를 찾지 못했습니다.
        </div>
      ) : (
        <>
          {categories.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-stone-700 mb-2">
                기능성 카테고리 ({categories.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1 text-xs"
                    title={[
                      c.largeCategoryName,
                      c.midCategoryName,
                      c.smallCategoryName,
                    ]
                      .filter(Boolean)
                      .join(" › ")}
                  >
                    <span className="font-medium">{c.groupName}</span>
                    {c.largeCategoryName && (
                      <span className="text-[10px] text-emerald-500">
                        · {c.largeCategoryName}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {rawMaterials.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-stone-700 mb-2">
                관련 원료 ({rawMaterials.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rawMaterials.map((rm) => {
                  const intake = formatIntake(
                    rm.dailyIntakeMin,
                    rm.dailyIntakeMax,
                    rm.weightUnit
                  );
                  const warningOpen = openWarnings.has(rm.id);
                  return (
                    <div
                      key={rm.id}
                      className="border border-stone-200 rounded-lg p-3 bg-stone-50/50"
                    >
                      <div className="font-medium text-stone-900 text-sm">
                        {rm.rawMaterialName}
                      </div>
                      {rm.primaryFunction && (
                        <div className="mt-1 text-xs text-stone-600 leading-relaxed">
                          <span className="text-stone-400">주된 기능성: </span>
                          {rm.primaryFunction}
                        </div>
                      )}
                      {intake && (
                        <div className="mt-1 text-xs text-stone-600">
                          <span className="text-stone-400">일일 섭취량: </span>
                          {intake}
                        </div>
                      )}
                      {rm.warning && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => toggleWarning(rm.id)}
                            className="text-[11px] text-amber-700 hover:text-amber-800 underline-offset-2 hover:underline"
                          >
                            {warningOpen
                              ? "▾ 주의사항 닫기"
                              : "▸ 섭취 주의사항 보기"}
                          </button>
                          {warningOpen && (
                            <div className="mt-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1.5 leading-relaxed">
                              {rm.warning}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <p className="text-[11px] text-stone-400 leading-relaxed">
        출처: 식약처 건강기능식품 DB. 본 정보는 참고용이며 실제 제품 표시와 다를 수
        있습니다.
      </p>
    </section>
  );
}

function formatIntake(
  min: string | null,
  max: string | null,
  unit: string | null
): string | null {
  const u = unit ?? "";
  if (min && max) return `${min} ~ ${max}${u}`;
  if (min) return `최소 ${min}${u}`;
  if (max) return `최대 ${max}${u}`;
  return null;
}
