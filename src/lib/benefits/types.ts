import { z } from "zod";

// ───────────────────────────────────────────────────
// 사용자 입력 프로필 — 11개 카테고리
// 모든 필드는 optional. 점진적 입력(progressive disclosure) 전제.
// matcher는 입력된 필드만 보고 매칭, 누락 필드는 missingFields로 표시.
// ───────────────────────────────────────────────────

// 1. 인구학
export const DemographicsSchema = z.object({
  birthYear: z.number().int().min(1900).max(2030).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  maritalStatus: z.enum(["single", "married", "divorced", "widowed"]).optional(),
  householdSize: z.number().int().min(1).max(20).optional(),
});

// 2. 소득/재산
export const IncomeAssetsSchema = z.object({
  insuranceType: z.enum(["employer", "regional", "dependent", "none"]).optional(),
  monthlyInsurancePremiumKrw: z.number().int().min(0).optional(),
  annualIncomeKrw: z.number().int().min(0).optional(),
  incomeBracketRatio: z.number().min(0).max(500).optional(), // 중위소득 대비 %
  ownsHome: z.boolean().optional(),
  homeValueKrw: z.number().int().min(0).optional(),
  ownsCar: z.boolean().optional(),
  carValueKrw: z.number().int().min(0).optional(),
  financialAssetsKrw: z.number().int().min(0).optional(),
});

// 3. 가구 상태
export const HouseholdSchema = z.object({
  isSinglePerson: z.boolean().optional(),
  isNewlywed: z.boolean().optional(),
  marriageDate: z.string().optional(), // ISO date
  isSingleParent: z.boolean().optional(),
  isMultiChild: z.boolean().optional(), // 다자녀 (보통 3자녀+)
  isMulticultural: z.boolean().optional(),
  isNorthKoreanDefector: z.boolean().optional(),
  isGrandparentRaising: z.boolean().optional(), // 조손가구
});

// 4. 수급/등록 자격
export const WelfareStatusSchema = z.object({
  basicLivelihoodType: z
    .enum(["livelihood", "medical", "housing", "education", "none"])
    .optional(),
  isNearPoor: z.boolean().optional(), // 차상위
  disabilityGrade: z.enum(["severe", "mild", "none"]).optional(),
  disabilityType: z.string().optional(),
  isVeteran: z.boolean().optional(),
  isHonorRecipient: z.boolean().optional(), // 보훈
});

// 5. 거주
export const ResidenceSchema = z.object({
  regionCode: z.string().length(5).optional(), // 행안부 5자리 행정구역코드 (시군구)
  regionName: z.string().optional(),
  housingType: z
    .enum(["owned", "lease", "monthlyRent", "publicRental", "other"])
    .optional(),
  residenceMonths: z.number().int().min(0).optional(),
});

// 6. 고용
export const EmploymentSchema = z.object({
  status: z
    .enum(["employed", "jobseeking", "unemployed", "retired", "student"])
    .optional(),
  employmentType: z
    .enum(["regular", "contract", "daily", "platform", "freelance"])
    .optional(),
  hasFourInsurances: z.boolean().optional(), // 4대보험 가입
  isCareerInterrupted: z.boolean().optional(), // 경력단절
});

// 7. 사업자 (자영업/소상공인)
export const BusinessSchema = z.object({
  hasBusiness: z.boolean().optional(),
  ksicCode: z.string().optional(), // 한국표준산업분류 KSIC
  industry: z.string().optional(), // 사용자 친화적 라벨 (외식/숙박/도소매…)
  openYear: z.number().int().min(1900).max(2030).optional(),
  annualRevenueKrw: z.number().int().min(0).optional(),
  employeeCount: z.number().int().min(0).optional(),
  businessSize: z.enum(["smallMerchant", "sme", "midMarket"]).optional(),
});

// 8. 자녀
export const ChildSchema = z.object({
  birthYear: z.number().int().min(1900).max(2030).optional(),
  stage: z
    .enum(["infant", "preschool", "elementary", "middle", "high", "university"])
    .optional(),
});
export const ChildrenSchema = z.object({
  children: z.array(ChildSchema).default([]),
});

// 9. 건강
export const HealthSchema = z.object({
  isPregnant: z.boolean().optional(),
  expectedDeliveryDate: z.string().optional(),
  hasChronicCondition: z.boolean().optional(),
  chronicConditions: z.array(z.string()).optional(),
});

// 10. 교육
export const EducationSchema = z.object({
  educationLevel: z
    .enum(["highSchool", "college", "university", "graduate"])
    .optional(),
  isCurrentlyEnrolled: z.boolean().optional(),
  hasStudentLoan: z.boolean().optional(),
});

// 11. 특수 자격
export const SpecialStatusSchema = z.object({
  militaryStatus: z
    .enum(["serving", "discharged", "exempt", "none"])
    .optional(),
  isForeigner: z.boolean().optional(),
  isFarmer: z.boolean().optional(),
  isYouth: z.boolean().optional(), // 만 19~39 (자동 계산용)
});

// 통합 프로필 스키마
export const BenefitProfileSchema = z.object({
  demographics: DemographicsSchema.default({}),
  incomeAssets: IncomeAssetsSchema.default({}),
  household: HouseholdSchema.default({}),
  welfareStatus: WelfareStatusSchema.default({}),
  residence: ResidenceSchema.default({}),
  employment: EmploymentSchema.default({}),
  business: BusinessSchema.default({}),
  children: ChildrenSchema.default({ children: [] }),
  health: HealthSchema.default({}),
  education: EducationSchema.default({}),
  special: SpecialStatusSchema.default({}),
});

export type BenefitProfile = z.infer<typeof BenefitProfileSchema>;

// 카테고리 메타 — 온보딩 UI에서 진행률/순서 표시
// coreFields: 해당 카테고리에서 매칭에 가장 영향이 큰 핵심 필드 수
export const CATEGORIES = [
  { key: "demographics", label: "기본 정보", coreFields: 4, priority: 1 },
  { key: "residence", label: "거주지", coreFields: 3, priority: 1 },
  { key: "incomeAssets", label: "소득/재산", coreFields: 5, priority: 2 },
  { key: "household", label: "가구 형태", coreFields: 5, priority: 2 },
  { key: "employment", label: "고용", coreFields: 3, priority: 2 },
  { key: "business", label: "사업자", coreFields: 6, priority: 3 },
  { key: "children", label: "자녀", coreFields: 1, priority: 3 },
  { key: "welfareStatus", label: "복지 자격", coreFields: 4, priority: 3 },
  { key: "health", label: "건강", coreFields: 3, priority: 4 },
  { key: "education", label: "교육", coreFields: 3, priority: 4 },
  { key: "special", label: "특수 자격", coreFields: 4, priority: 4 },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

// 입력 완성도 계산 — 0~100
// 각 카테고리에서 채워진 필드 수 / 전체 핵심 필드 수
export function computeCompleteness(profile: Partial<BenefitProfile>): number {
  let totalCore = 0;
  let filled = 0;
  for (const cat of CATEGORIES) {
    totalCore += cat.coreFields;
    const section = (profile as Record<string, unknown>)[cat.key];
    if (section && typeof section === "object") {
      filled += Object.values(section as Record<string, unknown>).filter(
        (v) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
      ).length;
    }
  }
  return Math.min(100, Math.round((filled / totalCore) * 100));
}

// ───────────────────────────────────────────────────
// 출처 식별자 (Benefit.sourceCode)
// ───────────────────────────────────────────────────
export const SOURCE_CODES = {
  GOV24: "GOV24", // 행안부 공공서비스(혜택)정보 15113968
  MSS_BIZ: "MSS_BIZ", // 중기부 사업공고
  MSS_SUPPORT: "MSS_SUPPORT", // 중기부 중소기업 지원사업
  BIZINFO: "BIZINFO", // 기업마당
  SEOUL: "SEOUL", // 서울 열린데이터광장
  NTS: "NTS", // 국세청 (사업자등록 조회 — 자격 검증용)
  MANUAL: "MANUAL", // 수동 입력
} as const;

export type SourceCode = (typeof SOURCE_CODES)[keyof typeof SOURCE_CODES];

// ───────────────────────────────────────────────────
// fetcher가 반환하는 통일 형식
// 각 출처별 fetcher는 외부 API 응답을 이 형식으로 정규화
// ───────────────────────────────────────────────────
export interface BenefitRaw {
  sourceCode: SourceCode;
  sourceId: string; // 출처의 원본 ID (멱등 upsert 키)
  title: string;
  summary?: string;
  agency?: string;
  category?: string;
  targetType?: "individual" | "household" | "business" | "mixed";
  regionCodes?: string[];
  applyUrl?: string;
  detailUrl?: string;
  applyStartAt?: Date;
  applyEndAt?: Date;
  // 자격 조건은 출처 응답을 분석한 후 룰로 변환 (matcher가 해석)
  eligibilityRules?: Record<string, unknown>;
  // 원본 응답 — 디버깅/재처리
  rawData?: Record<string, unknown>;
}
