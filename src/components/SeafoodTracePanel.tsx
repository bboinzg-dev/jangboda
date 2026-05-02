"use client";

import { useState } from "react";

// 수산물이력추적 조회 패널 — 사용자가 포장 라벨의 이력추적등록번호를 입력하면
// 식약처 I1920/I1930/I1940 on-demand 조회.
// 수산물 카테고리/이름이 매칭될 때만 자체 표시.

type SeafoodBasic = {
  histTraceRegNo: string;
  goodsName: string;
  prdlstGroupName: string;
  enterpriseName: string;
  telNo: string;
  address: string;
};

type SeafoodProduction = {
  histTraceRegNo: string;
  lotNoWarehousing: string;
  goodsName: string;
  prdlstGroupName: string;
  settQty: string;
  warehousingDate: string;
  warehousingQty: string;
  warehousingUnit: string;
};

type SeafoodRelease = {
  histTraceRegNo: string;
  lotNoRelease: string;
  lotNoWarehousing: string;
  prdlstGroupName: string;
  releaseDvsName: string;
  productionDate: string;
  productionQty: string;
  releaseDate: string;
  releaseQty: string;
  releaseUnit: string;
};

type SeafoodTraceResult = {
  found: boolean;
  regNo: string;
  basic: SeafoodBasic | null;
  productions: SeafoodProduction[];
  releases: SeafoodRelease[];
  source: "foodsafety" | "mock" | "none";
  error?: string;
};

// 수산물 키워드 — 이름 부분 매칭으로 패널 노출 여부 판단
const SEAFOOD_KEYWORDS = [
  "고등어",
  "갈치",
  "명태",
  "코다리",
  "새우",
  "오징어",
  "낙지",
  "굴",
  "미역",
  "김",
  "다시마",
  "멸치",
  "멍게",
  "전복",
  "가리비",
  "조개",
  "게",
  "연어",
  "참치",
  "광어",
  "우럭",
  "도미",
  "삼치",
  "꽁치",
];

function isSeafoodProduct(category: string, name: string): boolean {
  if (!category && !name) return false;
  if (category) {
    if (category.includes("수산") || category.includes("해산")) return true;
  }
  if (name) {
    for (const kw of SEAFOOD_KEYWORDS) {
      if (name.includes(kw)) return true;
    }
  }
  return false;
}

// YYYYMMDD → YYYY.MM.DD
function fmtDate(s: string): string {
  if (!s) return "-";
  const t = s.replace(/[^0-9]/g, "");
  if (t.length === 8) {
    return `${t.slice(0, 4)}.${t.slice(4, 6)}.${t.slice(6, 8)}`;
  }
  return s;
}

export default function SeafoodTracePanel({
  productCategory,
  productName,
}: {
  productCategory: string;
  productName: string;
}) {
  const [regNo, setRegNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeafoodTraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 비수산물이면 패널 자체를 숨김
  if (!isSeafoodProduct(productCategory ?? "", productName ?? "")) {
    return null;
  }

  const handleLookup = async () => {
    const trimmed = regNo.trim();
    if (!trimmed) {
      setError("이력추적등록번호를 입력하세요");
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/seafood-trace?regNo=${encodeURIComponent(trimmed)}`
      );
      const json = (await res.json()) as SeafoodTraceResult;
      if (!res.ok) {
        setError(json.error ?? "조회 중 오류가 발생했습니다");
      } else if (json.error && !json.found) {
        setError(json.error);
      } else if (!json.found) {
        setError("등록된 이력 정보가 없습니다");
      } else {
        setResult(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-white border border-stone-200 rounded-xl p-4">
      <h2 className="font-bold text-sm mb-1 flex items-center gap-2">
        🐟 수산물 이력추적 조회
      </h2>
      <div className="text-xs text-stone-500 mb-3">
        포장 라벨의 이력추적등록번호를 입력하세요
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={regNo}
          onChange={(e) => setRegNo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleLookup();
          }}
          placeholder="예: 0123456789AB"
          className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          disabled={loading}
        />
        <button
          type="button"
          onClick={handleLookup}
          disabled={loading || !regNo.trim()}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? "조회중..." : "조회"}
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          <div className="h-4 w-1/3 bg-stone-100 rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-stone-100 rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-stone-100 rounded animate-pulse" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Found result */}
      {!loading && result && result.found && (
        <div className="space-y-4">
          {/* 기본정보 */}
          {result.basic && (
            <div className="border border-stone-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-stone-700 mb-2">
                기본정보
              </div>
              <dl className="grid grid-cols-3 gap-y-1.5 text-sm">
                <dt className="text-stone-500 col-span-1">상품명</dt>
                <dd className="col-span-2 font-medium text-stone-800">
                  {result.basic.goodsName || "-"}
                </dd>
                <dt className="text-stone-500 col-span-1">품목</dt>
                <dd className="col-span-2 text-stone-700">
                  {result.basic.prdlstGroupName || "-"}
                </dd>
                <dt className="text-stone-500 col-span-1">업소명</dt>
                <dd className="col-span-2 text-stone-700">
                  {result.basic.enterpriseName || "-"}
                </dd>
                <dt className="text-stone-500 col-span-1">전화</dt>
                <dd className="col-span-2 text-stone-700">
                  {result.basic.telNo || "-"}
                </dd>
                <dt className="text-stone-500 col-span-1">주소</dt>
                <dd className="col-span-2 text-stone-700">
                  {result.basic.address || "-"}
                </dd>
              </dl>
            </div>
          )}

          {/* 생산이력 */}
          {result.productions.length > 0 && (
            <div className="border border-stone-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-stone-700 mb-2 flex items-center gap-2">
                생산이력
                <span className="text-[10px] font-normal text-stone-500 bg-stone-100 rounded px-1.5 py-0.5">
                  {result.productions.length}건
                </span>
              </div>
              <ul className="space-y-2">
                {result.productions.map((p, idx) => (
                  <li
                    key={`${p.lotNoWarehousing}-${idx}`}
                    className="text-sm bg-stone-50 rounded px-2.5 py-2"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <span className="text-stone-500 text-xs">입고일자</span>{" "}
                        <span className="font-medium text-stone-800">
                          {fmtDate(p.warehousingDate)}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-stone-500">
                        로트 {p.lotNoWarehousing || "-"}
                      </div>
                    </div>
                    <div className="text-xs text-stone-600 mt-1">
                      입고수량 {p.warehousingQty || "-"} {p.warehousingUnit}
                      {p.settQty && ` · 입식수량 ${p.settQty}`}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 출하이력 */}
          {result.releases.length > 0 && (
            <div className="border border-stone-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-stone-700 mb-2 flex items-center gap-2">
                출하이력
                <span className="text-[10px] font-normal text-stone-500 bg-stone-100 rounded px-1.5 py-0.5">
                  {result.releases.length}건
                </span>
              </div>
              <ul className="space-y-2">
                {result.releases.map((r, idx) => (
                  <li
                    key={`${r.lotNoRelease}-${idx}`}
                    className="text-sm bg-stone-50 rounded px-2.5 py-2"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <span className="text-stone-500 text-xs">출고일자</span>{" "}
                        <span className="font-medium text-stone-800">
                          {fmtDate(r.releaseDate)}
                        </span>
                        {r.releaseDvsName && (
                          <span className="ml-2 text-[11px] bg-brand-50 text-brand-700 rounded px-1.5 py-0.5">
                            {r.releaseDvsName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-stone-500">
                        로트 {r.lotNoRelease || "-"}
                      </div>
                    </div>
                    <div className="text-xs text-stone-600 mt-1">
                      생산일자 {fmtDate(r.productionDate)} · 출고수량{" "}
                      {r.releaseQty || "-"} {r.releaseUnit}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.source === "mock" && (
            <div className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              ⚠ 개발 환경: 샘플(mock) 데이터입니다
            </div>
          )}
        </div>
      )}

      <div className="text-[11px] text-stone-400 mt-3">
        출처: 식품의약품안전처 수산물이력 API
      </div>
    </section>
  );
}
