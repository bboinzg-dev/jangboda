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
        {category === "incomeAssets" && (
          <IncomeAssetsFields values={values} setField={setField} />
        )}
        {category === "employment" && (
          <EmploymentFields values={values} setField={setField} />
        )}
        {category === "welfareStatus" && (
          <WelfareStatusFields values={values} setField={setField} />
        )}
        {category === "children" && (
          <ChildrenFields values={values} setField={setField} />
        )}
        {category === "health" && (
          <HealthFields values={values} setField={setField} />
        )}
        {category === "education" && (
          <EducationFields values={values} setField={setField} />
        )}
        {category === "special" && (
          <SpecialFields values={values} setField={setField} />
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
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "placeholder" | "type">) {
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

// ───────── 만원 환산 헬퍼 ─────────
function ManwonHint({ raw }: { raw: string }) {
  const n = Number(raw);
  if (!isFinite(n) || n <= 0) return null;
  const manwon = Math.round(n / 10000).toLocaleString();
  return <p className="mt-1 text-xs text-indigo-600">약 {manwon} 만원</p>;
}

// ───────── incomeAssets ─────────
function IncomeAssetsFields({ values, setField }: FieldProps) {
  const ownsHome = getBool(values, "ownsHome");
  const ownsCar = getBool(values, "ownsCar");
  return (
    <>
      <div>
        <FieldLabel>건강보험 유형</FieldLabel>
        <RadioGroup
          name="insuranceType"
          value={getStr(values, "insuranceType")}
          onChange={(v) => setField("insuranceType", v)}
          options={[
            { value: "employer", label: "직장가입자" },
            { value: "regional", label: "지역가입자" },
            { value: "dependent", label: "피부양자" },
            { value: "none", label: "없음" },
          ]}
        />
      </div>

      <div>
        <FieldLabel hint="원 단위 정수 (예: 120000)">
          월 건강보험료
        </FieldLabel>
        <TextInput
          type="number"
          value={getNum(values, "monthlyInsurancePremiumKrw")}
          onChange={(v) =>
            setField(
              "monthlyInsurancePremiumKrw",
              v === "" ? undefined : Number(v),
            )
          }
          placeholder="120000"
          min={0}
        />
        <ManwonHint raw={getNum(values, "monthlyInsurancePremiumKrw")} />
      </div>

      <div>
        <FieldLabel hint="원 단위 정수 (예: 40000000 = 4천만원)">
          연소득
        </FieldLabel>
        <TextInput
          type="number"
          value={getNum(values, "annualIncomeKrw")}
          onChange={(v) =>
            setField("annualIncomeKrw", v === "" ? undefined : Number(v))
          }
          placeholder="40000000"
          min={0}
        />
        <ManwonHint raw={getNum(values, "annualIncomeKrw")} />
      </div>

      <div>
        <FieldLabel hint="중위소득 대비 %">소득 구간 비율</FieldLabel>
        <TextInput
          type="number"
          value={getNum(values, "incomeBracketRatio")}
          onChange={(v) =>
            setField("incomeBracketRatio", v === "" ? undefined : Number(v))
          }
          placeholder="예: 50, 100, 150"
          min={0}
          max={500}
        />
        <p className="mt-1 text-xs text-stone-400">
          모르면 비워두세요. 연소득과 가구원 수로 추정 가능합니다.
        </p>
      </div>

      <Toggle
        label="자가 주택 보유"
        value={ownsHome}
        onChange={(v) => setField("ownsHome", v)}
      />
      {ownsHome && (
        <div>
          <FieldLabel hint="원 단위 (공시가격 기준 권장)">
            주택 가격
          </FieldLabel>
          <TextInput
            type="number"
            value={getNum(values, "homeValueKrw")}
            onChange={(v) =>
              setField("homeValueKrw", v === "" ? undefined : Number(v))
            }
            placeholder="300000000"
            min={0}
          />
          <ManwonHint raw={getNum(values, "homeValueKrw")} />
        </div>
      )}

      <Toggle
        label="자동차 보유"
        value={ownsCar}
        onChange={(v) => setField("ownsCar", v)}
      />
      {ownsCar && (
        <div>
          <FieldLabel hint="원 단위 (차량 가액)">자동차 가격</FieldLabel>
          <TextInput
            type="number"
            value={getNum(values, "carValueKrw")}
            onChange={(v) =>
              setField("carValueKrw", v === "" ? undefined : Number(v))
            }
            placeholder="20000000"
            min={0}
          />
          <ManwonHint raw={getNum(values, "carValueKrw")} />
        </div>
      )}

      <div>
        <FieldLabel hint="예금/적금/주식 등 합계">금융자산</FieldLabel>
        <TextInput
          type="number"
          value={getNum(values, "financialAssetsKrw")}
          onChange={(v) =>
            setField("financialAssetsKrw", v === "" ? undefined : Number(v))
          }
          placeholder="10000000"
          min={0}
        />
        <ManwonHint raw={getNum(values, "financialAssetsKrw")} />
      </div>
    </>
  );
}

// ───────── employment ─────────
function EmploymentFields({ values, setField }: FieldProps) {
  const status = getStr(values, "status");
  return (
    <>
      <div>
        <FieldLabel>고용 상태</FieldLabel>
        <RadioGroup
          name="status"
          value={status}
          onChange={(v) => setField("status", v)}
          options={[
            { value: "employed", label: "재직 중" },
            { value: "jobseeking", label: "구직 중" },
            { value: "unemployed", label: "실업" },
            { value: "retired", label: "은퇴" },
            { value: "student", label: "학생" },
          ]}
        />
      </div>

      {status === "employed" && (
        <div>
          <FieldLabel>고용 형태</FieldLabel>
          <RadioGroup
            name="employmentType"
            value={getStr(values, "employmentType")}
            onChange={(v) => setField("employmentType", v)}
            options={[
              { value: "regular", label: "정규직" },
              { value: "contract", label: "계약직" },
              { value: "daily", label: "일용직" },
              { value: "platform", label: "플랫폼 노동" },
              { value: "freelance", label: "프리랜서" },
            ]}
          />
        </div>
      )}

      <div className="divide-y divide-stone-100">
        <Toggle
          label="4대보험 가입"
          value={getBool(values, "hasFourInsurances")}
          onChange={(v) => setField("hasFourInsurances", v)}
        />
        <Toggle
          label="경력단절 (출산/육아 등으로 일을 쉰 적 있음)"
          value={getBool(values, "isCareerInterrupted")}
          onChange={(v) => setField("isCareerInterrupted", v)}
        />
      </div>
    </>
  );
}

// ───────── welfareStatus ─────────
function WelfareStatusFields({ values, setField }: FieldProps) {
  const grade = getStr(values, "disabilityGrade");
  return (
    <>
      <div>
        <FieldLabel>기초생활수급 유형</FieldLabel>
        <RadioGroup
          name="basicLivelihoodType"
          value={getStr(values, "basicLivelihoodType")}
          onChange={(v) => setField("basicLivelihoodType", v)}
          options={[
            { value: "livelihood", label: "생계급여" },
            { value: "medical", label: "의료급여" },
            { value: "housing", label: "주거급여" },
            { value: "education", label: "교육급여" },
            { value: "none", label: "해당 없음" },
          ]}
        />
      </div>

      <Toggle
        label="차상위 계층"
        value={getBool(values, "isNearPoor")}
        onChange={(v) => setField("isNearPoor", v)}
      />

      <div>
        <FieldLabel>장애 등급</FieldLabel>
        <RadioGroup
          name="disabilityGrade"
          value={grade}
          onChange={(v) => setField("disabilityGrade", v)}
          options={[
            { value: "severe", label: "중증" },
            { value: "mild", label: "경증" },
            { value: "none", label: "없음" },
          ]}
        />
      </div>

      {grade && grade !== "none" && (
        <div>
          <FieldLabel hint="예: 지체, 시각, 청각 등">장애 유형</FieldLabel>
          <TextInput
            value={getStr(values, "disabilityType")}
            onChange={(v) => setField("disabilityType", v)}
            placeholder="예: 지체장애"
          />
        </div>
      )}

      <div className="divide-y divide-stone-100">
        <Toggle
          label="국가유공자"
          value={getBool(values, "isVeteran")}
          onChange={(v) => setField("isVeteran", v)}
        />
        <Toggle
          label="보훈 대상자"
          value={getBool(values, "isHonorRecipient")}
          onChange={(v) => setField("isHonorRecipient", v)}
        />
      </div>
    </>
  );
}

// ───────── children ─────────
type ChildItem = { birthYear?: number; stage?: string };

function ChildrenFields({ values, setField }: FieldProps) {
  const raw = values["children"];
  const initial: ChildItem[] = Array.isArray(raw) ? (raw as ChildItem[]) : [];
  const [list, setList] = useState<ChildItem[]>(initial);

  function update(next: ChildItem[]) {
    setList(next);
    setField("children", next);
  }
  function add() {
    update([...list, {}]);
  }
  function remove(idx: number) {
    update(list.filter((_, i) => i !== idx));
  }
  function patch(idx: number, key: keyof ChildItem, value: unknown) {
    const next = list.map((item, i) =>
      i === idx ? { ...item, [key]: value } : item,
    );
    update(next);
  }

  const stageOptions = [
    { value: "infant", label: "영아 (0~2세)" },
    { value: "preschool", label: "유아 (3~5세)" },
    { value: "elementary", label: "초등학생" },
    { value: "middle", label: "중학생" },
    { value: "high", label: "고등학생" },
    { value: "university", label: "대학생" },
  ];

  return (
    <div className="space-y-4">
      {list.length === 0 && (
        <p className="text-sm text-stone-500">
          자녀가 없거나 입력하지 않으려면 그대로 두세요.
        </p>
      )}

      {list.map((child, idx) => (
        <div
          key={idx}
          className="border border-stone-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-stone-700">
              자녀 {idx + 1}
            </span>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-xs text-rose-500 hover:text-rose-700"
            >
              삭제
            </button>
          </div>

          <div>
            <FieldLabel hint="예: 2018">출생연도</FieldLabel>
            <TextInput
              type="number"
              value={child.birthYear !== undefined ? String(child.birthYear) : ""}
              onChange={(v) =>
                patch(idx, "birthYear", v === "" ? undefined : Number(v))
              }
              placeholder="2018"
              min={1900}
              max={2030}
            />
          </div>

          <div>
            <FieldLabel>학령</FieldLabel>
            <Select
              value={child.stage ?? ""}
              onChange={(v) => patch(idx, "stage", v === "" ? undefined : v)}
              options={stageOptions}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="w-full bg-white hover:bg-indigo-50 border border-dashed border-indigo-300 text-indigo-600 py-2.5 rounded-lg font-medium text-sm"
      >
        + 자녀 추가
      </button>
    </div>
  );
}

// ───────── health ─────────
function HealthFields({ values, setField }: FieldProps) {
  const isPregnant = getBool(values, "isPregnant");
  const hasChronic = getBool(values, "hasChronicCondition");

  // chronicConditions는 배열로 저장. 입력 UI는 콤마로 구분된 텍스트.
  const conditionsArr = Array.isArray(values["chronicConditions"])
    ? (values["chronicConditions"] as string[])
    : [];
  const conditionsText = conditionsArr.join(", ");

  return (
    <>
      <Toggle
        label="임신 중"
        value={isPregnant}
        onChange={(v) => setField("isPregnant", v)}
      />

      {isPregnant && (
        <div>
          <FieldLabel>출산 예정일</FieldLabel>
          <TextInput
            type="date"
            value={getStr(values, "expectedDeliveryDate")}
            onChange={(v) => setField("expectedDeliveryDate", v)}
          />
        </div>
      )}

      <Toggle
        label="만성질환 있음"
        value={hasChronic}
        onChange={(v) => setField("hasChronicCondition", v)}
      />

      {hasChronic && (
        <div>
          <FieldLabel hint="콤마(,)로 구분해서 입력">만성질환 목록</FieldLabel>
          <TextInput
            value={conditionsText}
            onChange={(v) => {
              const arr = v
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
              setField(
                "chronicConditions",
                arr.length > 0 ? arr : undefined,
              );
            }}
            placeholder="예: 당뇨, 고혈압"
          />
        </div>
      )}
    </>
  );
}

// ───────── education ─────────
function EducationFields({ values, setField }: FieldProps) {
  return (
    <>
      <div>
        <FieldLabel>최종 학력</FieldLabel>
        <RadioGroup
          name="educationLevel"
          value={getStr(values, "educationLevel")}
          onChange={(v) => setField("educationLevel", v)}
          options={[
            { value: "highSchool", label: "고졸" },
            { value: "college", label: "전문대졸" },
            { value: "university", label: "대졸" },
            { value: "graduate", label: "대학원 이상" },
          ]}
        />
      </div>

      <div className="divide-y divide-stone-100">
        <Toggle
          label="현재 재학 중"
          value={getBool(values, "isCurrentlyEnrolled")}
          onChange={(v) => setField("isCurrentlyEnrolled", v)}
        />
        <Toggle
          label="학자금 대출 보유"
          value={getBool(values, "hasStudentLoan")}
          onChange={(v) => setField("hasStudentLoan", v)}
        />
      </div>
    </>
  );
}

// ───────── special ─────────
function SpecialFields({ values, setField }: FieldProps) {
  return (
    <>
      <div>
        <FieldLabel>병역 상태</FieldLabel>
        <RadioGroup
          name="militaryStatus"
          value={getStr(values, "militaryStatus")}
          onChange={(v) => setField("militaryStatus", v)}
          options={[
            { value: "serving", label: "복무 중" },
            { value: "discharged", label: "제대" },
            { value: "exempt", label: "면제" },
            { value: "none", label: "해당 없음" },
          ]}
        />
      </div>

      <div className="divide-y divide-stone-100">
        <Toggle
          label="외국인"
          value={getBool(values, "isForeigner")}
          onChange={(v) => setField("isForeigner", v)}
        />
        <Toggle
          label="농업인 (영농 종사)"
          value={getBool(values, "isFarmer")}
          onChange={(v) => setField("isFarmer", v)}
        />
        <Toggle
          label="청년 (만 19~39세)"
          value={getBool(values, "isYouth")}
          onChange={(v) => setField("isYouth", v)}
        />
      </div>

      <p className="text-xs text-stone-400">
        청년 지원 사업 대부분이 만 19~39세를 기준으로 합니다. (사업별 상이)
      </p>
    </>
  );
}
