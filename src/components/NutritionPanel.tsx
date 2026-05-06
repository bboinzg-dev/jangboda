"use client";

import { useEffect, useState } from "react";

type NutritionFields = {
  energyKcal: number | null;
  waterG: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  sugarG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  cholesterolMg: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  potassiumMg: number | null;
  vitaminAUg: number | null;
  vitaminCMg: number | null;
};

type NutritionLookupResult = {
  found: boolean;
  foodCode: string | null;
  foodName: string | null;
  category: string | null;
  servingSize: string | null;
  nutrition: NutritionFields | null;
  source: "datagokr" | "mock" | "none";
};

// 영양소 라벨/단위/포맷 — 화면에 노출할 항목과 순서
type Row = {
  key: keyof NutritionFields;
  label: string;
  unit: string;
  decimals?: number; // 표시용 소수 자리
};

const ROWS: Row[] = [
  { key: "energyKcal", label: "에너지", unit: "kcal", decimals: 0 },
  { key: "carbsG", label: "탄수화물", unit: "g", decimals: 2 },
  { key: "sugarG", label: "당류", unit: "g", decimals: 2 },
  { key: "fiberG", label: "식이섬유", unit: "g", decimals: 2 },
  { key: "proteinG", label: "단백질", unit: "g", decimals: 2 },
  { key: "fatG", label: "지방", unit: "g", decimals: 2 },
  { key: "saturatedFatG", label: "포화지방", unit: "g", decimals: 2 },
  { key: "transFatG", label: "트랜스지방", unit: "g", decimals: 2 },
  { key: "cholesterolMg", label: "콜레스테롤", unit: "mg", decimals: 1 },
  { key: "sodiumMg", label: "나트륨", unit: "mg", decimals: 0 },
  { key: "potassiumMg", label: "칼륨", unit: "mg", decimals: 0 },
  { key: "calciumMg", label: "칼슘", unit: "mg", decimals: 0 },
  { key: "ironMg", label: "철", unit: "mg", decimals: 2 },
  { key: "vitaminAUg", label: "비타민A", unit: "μg RAE", decimals: 1 },
  { key: "vitaminCMg", label: "비타민C", unit: "mg", decimals: 1 },
  { key: "waterG", label: "수분", unit: "g", decimals: 1 },
];

function formatVal(v: number, decimals: number): string {
  if (decimals === 0) return Math.round(v).toLocaleString("ko-KR");
  // 소수 자리 표시 후 끝의 0 제거
  const fixed = v.toFixed(decimals);
  return fixed.replace(/\.?0+$/, "") || "0";
}

export default function NutritionPanel({
  productId,
  hideIfEmpty = false,
}: {
  productId: string;
  /** true면 데이터 없을 때 컴포넌트 전체 미노출 (details 밖에서 사용 시 유용) */
  hideIfEmpty?: boolean;
}) {
  const [data, setData] = useState<NutritionLookupResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/products/${productId}/nutrition`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: NutritionLookupResult | null) => {
        if (!cancelled) {
          setData(j);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    if (hideIfEmpty) return null;
    return (
      <section className="bg-white border border-border rounded-xl p-4">
        <div className="h-5 w-28 bg-stone-100 rounded animate-pulse mb-3" />
        <div className="text-xs text-stone-400">영양정보 불러오는 중...</div>
      </section>
    );
  }

  if (!data || !data.found || !data.nutrition) {
    if (hideIfEmpty) return null;
    return (
      <section className="bg-white border border-border rounded-xl p-4">
        <h2 className="font-bold text-sm mb-1 text-stone-600">
          🥗 영양 정보
        </h2>
        <div className="text-xs text-stone-400">
          영양정보를 찾지 못했습니다 (식품의약품안전처 DB 기준)
        </div>
      </section>
    );
  }

  const n = data.nutrition;

  // 비어있지 않은(non-null) 영양소만 표시
  const visibleRows = ROWS.filter((r) => n[r.key] !== null && n[r.key] !== undefined);

  // 영양 플래그 — 한국 일반적 권고치 기준
  const flags: { label: string; cls: string }[] = [];
  if (n.sodiumMg !== null && n.sodiumMg > 600) {
    flags.push({
      label: "고나트륨",
      cls: "bg-orange-100 text-orange-700 border-orange-200",
    });
  }
  if (n.sugarG !== null && n.sugarG > 15) {
    flags.push({
      label: "당류 높음",
      cls: "bg-yellow-100 text-yellow-700 border-yellow-200",
    });
  }
  if (n.energyKcal !== null && n.energyKcal > 400) {
    flags.push({
      label: "고열량",
      cls: "bg-red-100 text-red-700 border-red-200",
    });
  }

  const sourceLabel =
    data.source === "mock"
      ? "샘플 데이터 (개발용)"
      : "식품의약품안전처 식품영양성분DB";

  return (
    <section className="bg-white border border-border rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
        <h2 className="font-bold text-sm flex items-center gap-2">
          🥗 영양 정보
          {data.servingSize && (
            <span className="text-[11px] font-normal text-stone-500 bg-stone-100 rounded px-1.5 py-0.5">
              1회 제공량 {data.servingSize}
            </span>
          )}
        </h2>
        {data.foodName && (
          <span className="text-[11px] text-stone-400 truncate max-w-[60%]">
            매칭: {data.foodName}
          </span>
        )}
      </div>

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {flags.map((f) => (
            <span
              key={f.label}
              className={`text-[11px] border rounded-full px-2 py-0.5 ${f.cls}`}
            >
              ⚠️ {f.label}
            </span>
          ))}
        </div>
      )}

      {visibleRows.length === 0 ? (
        <div className="text-xs text-stone-400">
          표시할 영양소 값이 없습니다.
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {visibleRows.map((r) => {
            const val = n[r.key] as number;
            return (
              <div
                key={r.key}
                className="flex items-baseline justify-between border-b border-stone-100 py-1"
              >
                <dt className="text-stone-600">{r.label}</dt>
                <dd className="font-medium text-stone-800">
                  {formatVal(val, r.decimals ?? 1)}
                  <span className="text-[11px] text-stone-500 ml-0.5">
                    {r.unit}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      <div className="mt-3 text-[11px] text-stone-500">출처: {sourceLabel}</div>
      {flags.length > 0 && (
        <div className="mt-1 text-[10px] italic text-stone-400">
          1회 제공량 기준 일반적 권고치 — 정확한 기준은 식약처 가이드 참조
        </div>
      )}
    </section>
  );
}
