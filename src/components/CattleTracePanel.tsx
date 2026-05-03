"use client";

import { useState, type FormEvent } from "react";

// 쇠고기 이력추적 조회 패널
// 한우/쇠고기/소고기/정육 카테고리 제품에서만 노출.
// 사용자가 12자리 개체식별번호를 직접 입력하면 /api/cattle-trace 호출.

type CattleProduction = {
  enttyIdNo: string;
  birthDate: string | null;
  enttyStatus: string | null;
  cowKind: string | null;
  gender: string | null;
  farmName: string | null;
  vaccineLastDate: string | null;
  vaccineLastSeq: string | null;
};

type CattleProcess = {
  enttyIdNo: string;
  processPlaceCode: string | null;
  processDate: string | null;
  processPlaceName: string | null;
};

type CattleIntegrated = {
  enttyIdNo: string;
  slaughterPlaceName: string | null;
  inspectionResult: string | null;
  slaughterDate: string | null;
  address: string | null;
  inspectionPass: string | null;
  processDate: string | null;
  processPlaceName: string | null;
  birthDate: string | null;
  enttyStatus: string | null;
  cowKind: string | null;
  gender: string | null;
  farmName: string | null;
  vaccineLastDate: string | null;
  vaccineLastSeq: string | null;
};

type CattleTraceResult = {
  found: boolean;
  enttyIdNo: string;
  integrated: CattleIntegrated | null;
  production: CattleProduction | null;
  processes: CattleProcess[];
  source: "foodsafety" | "mock" | "none";
  error?: string;
};

type Props = {
  productCategory: string;
  productName: string;
};

// yyyymmdd → yyyy-mm-dd, 그 외 포맷은 그대로
function formatDate(d: string | null): string {
  if (!d) return "-";
  const t = d.trim();
  if (/^\d{8}$/.test(t)) {
    return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  }
  return t;
}

export default function CattleTracePanel({
  productCategory,
  productName,
}: Props) {
  // 한우/쇠고기/소고기/정육 관련 상품에서만 노출
  const shouldShow =
    productName.includes("한우") ||
    productName.includes("쇠고기") ||
    productName.includes("소고기") ||
    productCategory.includes("정육");

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CattleTraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!shouldShow) return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setData(null);

    const id = input.trim();
    if (!/^\d{12}$/.test(id)) {
      setError("개체식별번호는 12자리 숫자여야 합니다");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/cattle-trace?id=${encodeURIComponent(id)}`);
      if (!res.ok) {
        setError("이력 정보를 불러오지 못했습니다");
        return;
      }
      const json = (await res.json()) as CattleTraceResult;
      setData(json);
      if (!json.found) {
        setError(json.error ?? "해당 개체의 이력 정보를 찾지 못했습니다");
      }
    } catch {
      setError("이력 정보를 불러오는 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white border border-border rounded-xl p-5 space-y-4">
      <header className="space-y-1">
        <h2 className="font-bold text-stone-900 flex items-center gap-2">
          🐄 이력추적 조회
        </h2>
        <p className="text-xs text-stone-500">
          포장 라벨의 12자리 개체식별번호를 입력하세요
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{12}"
          maxLength={12}
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
          placeholder="예: 002123456789"
          className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button
          type="submit"
          disabled={loading || input.length !== 12}
          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:bg-stone-300 disabled:cursor-not-allowed"
        >
          {loading ? "조회 중..." : "조회"}
        </button>
      </form>

      {loading && (
        <div className="space-y-2">
          <div className="h-16 bg-stone-100 rounded-lg animate-pulse" />
          <div className="h-16 bg-stone-100 rounded-lg animate-pulse" />
          <div className="h-16 bg-stone-100 rounded-lg animate-pulse" />
        </div>
      )}

      {!loading && error && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && data && data.found && (
        <div className="space-y-3">
          {/* 통합 정보 */}
          {data.integrated && (
            <div className="border border-border rounded-lg p-3 bg-stone-50/50">
              <h3 className="text-sm font-semibold text-stone-700 mb-2">
                통합 이력
              </h3>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <Field label="출생일자" value={formatDate(data.integrated.birthDate)} />
                <Field label="도축일자" value={formatDate(data.integrated.slaughterDate)} />
                <Field
                  label="도축장소"
                  value={data.integrated.slaughterPlaceName ?? "-"}
                />
                <Field label="소종류" value={data.integrated.cowKind ?? "-"} />
                <Field label="성별" value={data.integrated.gender ?? "-"} />
                <Field label="농가명" value={data.integrated.farmName ?? "-"} />
                {data.integrated.address && (
                  <Field
                    label="주소"
                    value={data.integrated.address}
                    full
                  />
                )}
              </dl>
            </div>
          )}

          {/* 생산 정보 */}
          {data.production && (
            <div className="border border-border rounded-lg p-3 bg-stone-50/50">
              <h3 className="text-sm font-semibold text-stone-700 mb-2">
                생산 정보
              </h3>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <Field
                  label="백신최종접종일자"
                  value={formatDate(data.production.vaccineLastDate)}
                />
                <Field
                  label="차수"
                  value={data.production.vaccineLastSeq ?? "-"}
                />
                <Field
                  label="개체상태"
                  value={data.production.enttyStatus ?? "-"}
                />
              </dl>
            </div>
          )}

          {/* 가공 이력 */}
          {data.processes.length > 0 && (
            <div className="border border-border rounded-lg p-3 bg-stone-50/50">
              <h3 className="text-sm font-semibold text-stone-700 mb-2">
                가공 이력 ({data.processes.length}건)
              </h3>
              <ul className="space-y-1.5">
                {data.processes.map((p, i) => (
                  <li
                    key={`${p.processDate ?? ""}-${i}`}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-stone-500 font-mono">
                      {formatDate(p.processDate)}
                    </span>
                    <span className="text-stone-800 font-medium">
                      {p.processPlaceName ?? "-"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.source === "mock" && (
            <div className="text-[11px] text-warning-text bg-warning-soft border border-warning-soft rounded px-2 py-1">
              개발 모드: 샘플 데이터 (실제 API 키 미설정)
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-stone-400">
        출처: 식품의약품안전처 쇠고기이력추적 API
      </p>
    </section>
  );
}

function Field({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <dt className="text-[10px] text-stone-500">{label}</dt>
      <dd className="text-stone-800 font-medium truncate">{value}</dd>
    </div>
  );
}
