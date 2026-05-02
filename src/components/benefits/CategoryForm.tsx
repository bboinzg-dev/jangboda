"use client";

// 정부 혜택 카테고리 입력 폼 (클라이언트)
// useState만으로 구현 — 외부 폼 라이브러리 의존성 없음.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CATEGORIES, type CategoryKey } from "@/lib/benefits/types";

type Props = {
  category: CategoryKey;
  initialValues: Record<string, unknown>;
};

type Issue = { path: string; message: string };

// CATEGORIES 순서 기준 인덱스
function getCategoryIndex(key: CategoryKey): number {
  return CATEGORIES.findIndex((c) => c.key === key);
}

// 다음 카테고리 (마지막이면 null)
function getNextCategory(key: CategoryKey): CategoryKey | null {
  const idx = getCategoryIndex(key);
  if (idx < 0 || idx >= CATEGORIES.length - 1) return null;
  return CATEGORIES[idx + 1].key;
}

export default function CategoryForm({ category, initialValues }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(
    initialValues ?? {}
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);

  const idx = getCategoryIndex(category);
  const total = CATEGORIES.length;
  const stepNum = idx + 1;
  const progressPct = Math.round((stepNum / total) * 100);
  const nextCategory = getNextCategory(category);

  function setField(name: string, value: unknown) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setIssues([]);

    // 빈 문자열/undefined는 제거 (optional 필드 검증을 통과하기 위함)
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v === "" || v === undefined || v === null) continue;
      cleaned[k] = v;
    }

    try {
      const res = await fetch("/api/benefits/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, values: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "저장 실패");
        if (Array.isArray(data.issues)) setIssues(data.issues as Issue[]);
        setSubmitting(false);
        return;
      }
      // 성공 → 다음 카테고리로 이동, 마지막이면 /benefits로
      if (nextCategory) {
        router.push(`/benefits/onboarding/${nextCategory}`);
      } else {
        router.push("/benefits");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    if (nextCategory) {
      router.push(`/benefits/onboarding/${nextCategory}`);
    } else {
      router.push("/benefits");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 진행률 바 */}
      <div>
        <div className="flex justify-between text-xs text-stone-500 mb-1">
          <span>
            {stepNum} / {total} 단계
          </span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
        <p className="text-xs text-stone-500">
          모든 항목은 선택입니다. 아는 만큼만 입력해도 됩니다.
        </p>

        {category === "demographics" && (
          <DemographicsFields values={values} setField={setField} />
        )}
        {category === "residence" && (
          <ResidenceFields values={values} setField={setField} />
        )}
        {category === "business" && (
          <BusinessFields values={values} setField={setField} />
        )}
        {category === "household" && (
          <HouseholdFields values={values} setField={setField} />
        )}
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg p-3">
          <div className="font-medium">{error}</div>
          {issues.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs space-y-0.5">
              {issues.map((i, n) => (
                <li key={n}>
                  <span className="font-mono">{i.path}</span>: {i.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSkip}
          disabled={submitting}
          className="flex-1 bg-white hover:bg-stone-50 border border-stone-200 text-stone-700 py-2.5 rounded-lg font-medium disabled:opacity-50"
        >
          건너뛰기
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
        >
          {submitting
            ? "저장 중..."
            : nextCategory
              ? "저장하고 다음"
              : "저장하고 매칭 시작"}
        </button>
      </div>

      <div className="text-center">
        <Link
          href="/benefits/onboarding"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 카테고리 목록으로
        </Link>
      </div>
    </form>
  );
}

// ───────────────────────────────────────────────────
// 카테고리별 필드 컴포넌트
// ───────────────────────────────────────────────────

type FieldProps = {
  values: Record<string, unknown>;
  setField: (name: string, value: unknown) => void;
};

function getStr(v: Record<string, unknown>, k: string): string {
  const x = v[k];
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);
  return "";
}
function getNum(v: Record<string, unknown>, k: string): string {
  const x = v[k];
  if (typeof x === "number") return String(x);
  if (typeof x === "string") return x;
  return "";
}
function getBool(v: Record<string, unknown>, k: string): boolean {
  return v[k] === true;
}

function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-1">
      <label className="block text-sm font-medium text-stone-800">
        {children}
        <span className="ml-1 text-xs font-normal text-stone-400">(선택)</span>
      </label>
      {hint && <span className="text-xs text-stone-400">{hint}</span>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
      {...rest}
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-stone-300 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
    >
      <option value="">선택 안 함</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function RadioGroup({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <label
            key={o.value}
            className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer transition ${
              active
                ? "bg-indigo-50 border-indigo-400 text-indigo-700 font-medium"
                : "bg-white border-stone-200 text-stone-600 hover:border-stone-300"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={active}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        );
      })}
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="px-2 py-1.5 text-xs text-stone-400 hover:text-stone-600"
        >
          해제
        </button>
      )}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2 cursor-pointer">
      <span className="text-sm text-stone-800">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
          value ? "bg-indigo-600" : "bg-stone-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}

// ───────── demographics ─────────
function DemographicsFields({ values, setField }: FieldProps) {
  return (
    <>
      <div>
        <FieldLabel hint="예: 1990">출생연도</FieldLabel>
        <TextInput
          type="number"
          value={getNum(values, "birthYear")}
          onChange={(v) =>
            setField("birthYear", v === "" ? undefined : Number(v))
          }
          placeholder="1990"
        />
      </div>

      <div>
        <FieldLabel>성별</FieldLabel>
        <RadioGroup
          name="gender"
          value={getStr(values, "gender")}
          onChange={(v) => setField("gender", v)}
          options={[
            { value: "male", label: "남" },
            { value: "female", label: "여" },
            { value: "other", label: "기타" },
          ]}
        />
      </div>

      <div>
        <FieldLabel>혼인 상태</FieldLabel>
        <Select
          value={getStr(values, "maritalStatus")}
          onChange={(v) => setField("maritalStatus", v)}
          options={[
            { value: "single", label: "미혼" },
            { value: "married", label: "기혼" },
            { value: "divorced", label: "이혼" },
            { value: "widowed", label: "사별" },
          ]}
        />
      </div>

      <div>
        <FieldLabel hint="본인 포함">가구원 수</FieldLabel>
        <TextInput
          type="number"
          value={getNum(values, "householdSize")}
          onChange={(v) =>
            setField("householdSize", v === "" ? undefined : Number(v))
          }
          placeholder="3"
          min={1}
          max={20}
        />
      </div>
    </>
  );
}

// ───────── residence ─────────
function ResidenceFields({ values, setField }: FieldProps) {
  return (
    <>
      <div>
        <FieldLabel hint="행안부 5자리 시군구 코드">행정구역 코드</FieldLabel>
        <TextInput
          value={getStr(values, "regionCode")}
          onChange={(v) => setField("regionCode", v)}
          placeholder="예: 11680 (서울 강남구)"
          maxLength={5}
        />
        <p className="mt-1 text-xs text-stone-400">
          정확한 코드를 모르면 비워두고 지역명만 입력해도 됩니다. (선택 UI는
          추후 제공)
        </p>
      </div>

      <div>
        <FieldLabel>지역명</FieldLabel>
        <TextInput
          value={getStr(values, "regionName")}
          onChange={(v) => setField("regionName", v)}
          placeholder="예: 서울특별시 강남구"
        />
      </div>

      <div>
        <FieldLabel>주거 유형</FieldLabel>
        <RadioGroup
          name="housingType"
          value={getStr(values, "housingType")}
          onChange={(v) => setField("housingType", v)}
          options={[
            { value: "owned", label: "자가" },
            { value: "lease", label: "전세" },
            { value: "monthlyRent", label: "월세" },
            { value: "publicRental", label: "공공임대" },
            { value: "other", label: "기타" },
          ]}
        />
      </div>

      <div>
        <FieldLabel hint="현 거주지에서 거주한 개월 수">거주 기간</FieldLabel>
        <TextInput
          type="number"
          value={getNum(values, "residenceMonths")}
          onChange={(v) =>
            setField("residenceMonths", v === "" ? undefined : Number(v))
          }
          placeholder="24"
          min={0}
        />
      </div>
    </>
  );
}

// ───────── business ─────────
function BusinessFields({ values, setField }: FieldProps) {
  const hasBusiness = getBool(values, "hasBusiness");
  return (
    <>
      <Toggle
        label="사업자 등록이 되어 있습니다"
        value={hasBusiness}
        onChange={(v) => setField("hasBusiness", v)}
      />

      <div>
        <FieldLabel>업종</FieldLabel>
        <Select
          value={getStr(values, "industry")}
          onChange={(v) => setField("industry", v)}
          options={[
            { value: "외식", label: "외식" },
            { value: "숙박", label: "숙박" },
            { value: "도소매", label: "도소매" },
            { value: "제조", label: "제조" },
            { value: "서비스", label: "서비스" },
            { value: "기타", label: "기타" },
          ]}
        />
      </div>

      <div>
        <FieldLabel hint="예: 2020">개업 연도</FieldLabel>
        <TextInput
          type="number"
          value={getNum(values, "openYear")}
          onChange={(v) =>
            setField("openYear", v === "" ? undefined : Number(v))
          }
          placeholder="2020"
        />
      </div>

      <div>
        <FieldLabel hint="원 단위 정수 (예: 50000000 = 5천만원)">
          연 매출
        </FieldLabel>
        <TextInput
          type="number"
          value={getNum(values, "annualRevenueKrw")}
          onChange={(v) =>
            setField("annualRevenueKrw", v === "" ? undefined : Number(v))
          }
          placeholder="50000000"
          min={0}
        />
        {(() => {
          const n = Number(getNum(values, "annualRevenueKrw"));
          if (!isFinite(n) || n <= 0) return null;
          const manwon = Math.round(n / 10000).toLocaleString();
          return (
            <p className="mt-1 text-xs text-indigo-600">약 {manwon} 만원</p>
          );
        })()}
      </div>

      <div>
        <FieldLabel hint="대표자 제외">상시 근로자 수</FieldLabel>
        <TextInput
          type="number"
          value={getNum(values, "employeeCount")}
          onChange={(v) =>
            setField("employeeCount", v === "" ? undefined : Number(v))
          }
          placeholder="0"
          min={0}
        />
      </div>

      <div>
        <FieldLabel>사업자 규모</FieldLabel>
        <RadioGroup
          name="businessSize"
          value={getStr(values, "businessSize")}
          onChange={(v) => setField("businessSize", v)}
          options={[
            { value: "smallMerchant", label: "소상공인" },
            { value: "sme", label: "중소기업" },
            { value: "midMarket", label: "중견기업" },
          ]}
        />
      </div>
    </>
  );
}

// ───────── household ─────────
function HouseholdFields({ values, setField }: FieldProps) {
  const items: { key: string; label: string }[] = [
    { key: "isSinglePerson", label: "1인 가구" },
    { key: "isNewlywed", label: "신혼부부 (혼인 7년 이내)" },
    { key: "isSingleParent", label: "한부모 가정" },
    { key: "isMultiChild", label: "다자녀 가구 (보통 3자녀 이상)" },
    { key: "isMulticultural", label: "다문화 가정" },
    { key: "isNorthKoreanDefector", label: "북한이탈주민" },
  ];
  return (
    <div className="divide-y divide-stone-100">
      {items.map((it) => (
        <Toggle
          key={it.key}
          label={it.label}
          value={getBool(values, it.key)}
          onChange={(v) => setField(it.key, v)}
        />
      ))}
    </div>
  );
}
