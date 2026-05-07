// 식약처 등록 정보 표시 패널 — Product.metadata.foodsafety 데이터 노출
//
// 데이터 출처: 식약처 C005 (바코드연계) + I2570 (가공식품 바코드)
// 영수증 등록 시 lookupByBarcode로 enrich된 정보 (src/lib/foodsafety.ts)

type FoodSafetyMeta = {
  productName?: string;
  manufacturer?: string;
  foodType?: string;
  category?: { major?: string; mid?: string; minor?: string };
  shelfLife?: string;
  manufacturerAddress?: string;
  reportNo?: string;
  industry?: string;
};

export default function FoodSafetyPanel({ data }: { data: unknown }) {
  // 안전 추출 — metadata는 Json 타입이라 unknown으로 받음
  if (!data || typeof data !== "object") return null;
  const meta = (data as Record<string, unknown>).foodsafety as FoodSafetyMeta | undefined;
  if (!meta || typeof meta !== "object") return null;

  const hasAny =
    meta.foodType ||
    meta.category?.major ||
    meta.shelfLife ||
    meta.manufacturerAddress ||
    meta.reportNo ||
    meta.industry;
  if (!hasAny) return null;

  const categoryParts = [
    meta.category?.major,
    meta.category?.mid,
    meta.category?.minor,
  ].filter(Boolean) as string[];

  return (
    <div className="card p-4">
      <h3 className="font-semibold text-ink-1 mb-3 flex items-center gap-2">
        🏛️ 식약처 등록 정보
        <span className="text-[10px] text-ink-3 font-normal">
          (바코드 매칭)
        </span>
      </h3>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        {meta.foodType && (
          <Field label="식품유형" value={meta.foodType} />
        )}
        {categoryParts.length > 0 && (
          <Field label="분류" value={categoryParts.join(" › ")} />
        )}
        {meta.shelfLife && (
          <Field label="소비기한" value={meta.shelfLife} />
        )}
        {meta.industry && (
          <Field label="업종" value={meta.industry} />
        )}
        {meta.reportNo && (
          <Field label="품목제조보고번호" value={meta.reportNo} />
        )}
        {meta.manufacturerAddress && (
          <Field
            label="제조사 주소"
            value={meta.manufacturerAddress}
            wide
          />
        )}
      </dl>
      <div className="mt-3 text-[10px] text-ink-3">
        출처: 식품안전나라 OpenAPI (C005·I2570)
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  wide,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={`bg-surface-muted rounded p-2 ${wide ? "col-span-2 sm:col-span-3" : ""}`}>
      <dt className="text-[10px] text-ink-3">{label}</dt>
      <dd className="font-medium text-ink-1 mt-0.5 break-words">{value}</dd>
    </div>
  );
}
