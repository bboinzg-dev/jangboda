// 자유텍스트 자격조건 → LLM이 정형화한 룰 스키마
// Anthropic Claude API가 출력하는 JSON 객체를 검증하기 위한 zod 스키마와
// 매처(matcher.ts)가 평가에 사용하는 NormalizedRule 타입 정의.
import { z } from "zod";

// ───────────────────────────────────────────────────
// AVAILABLE_FLAGS
// LLM이 사용할 수 있는 boolean 플래그 키 화이트리스트.
// BenefitProfile 안에서 boolean 의미를 갖는 21개 필드를 평탄화한 키.
// LLM 프롬프트의 SCHEMA_AND_EXAMPLES에 그대로 노출하여 환각 방지.
// ───────────────────────────────────────────────────
export const AVAILABLE_FLAGS = [
  // 인구학/특수 자격
  "isYouth",
  // 사업자
  "hasBusiness",
  // 가구 형태
  "isSinglePerson",
  "isNewlywed",
  "isSingleParent",
  "isMultiChild",
  "isMulticultural",
  "isNorthKoreanDefector",
  // 건강
  "isPregnant",
  "hasChronicCondition",
  // 교육
  "isCurrentlyEnrolled",
  "hasStudentLoan",
  // 특수 자격
  "isForeigner",
  "isFarmer",
  // 복지/보훈
  "isVeteran",
  "isHonorRecipient",
  "isNearPoor",
  // 고용
  "hasFourInsurances",
  "isCareerInterrupted",
  // 소득/재산
  "ownsHome",
  "ownsCar",
] as const;

export type AvailableFlag = (typeof AVAILABLE_FLAGS)[number];

// ───────────────────────────────────────────────────
// NormalizedRule
// LLM이 자유텍스트(지원대상/선정기준/지원내용/신청방법)를 분석하여
// 산출하는 구조화 룰. 모든 필드는 optional — 문서에서 추출 가능한 것만 채움.
// ───────────────────────────────────────────────────
export interface NormalizedRule {
  // 연령 범위 (만 나이 기준)
  ageRange?: { min?: number; max?: number };
  // 거주 지역 코드 (5자리, "00000"=전국)
  regions?: string[];
  // 충족해야 하는 플래그 (AND)
  requiredFlags?: string[];
  // 충족 시 자격 박탈되는 플래그
  excludedFlags?: string[];
  // 중위소득 대비 최대 비율 (%) — 예: 75 = 중위소득 75% 이하
  incomeBracketMaxRatio?: number;
  // 허용 주거 형태
  housingType?: ("owned" | "lease" | "monthlyRent" | "publicRental" | "other")[];
  // 허용 기초생활수급 종류
  basicLivelihoodTypes?: ("livelihood" | "medical" | "housing" | "education")[];
  // 장애 등록 필수
  disabilityRequired?: boolean;
  // 사업자 등록 필수
  hasBusinessRequired?: boolean;
  // 허용 업종 (사용자 친화적 라벨, BusinessSchema.industry와 비교)
  industries?: string[];
  // 허용 최대 연매출 (원)
  maxAnnualRevenueKrw?: number;
  // 성별 한정
  genderOnly?: "male" | "female";
  // 한 줄 요약 — UI 카드에 표시
  targetSummary?: string;
  // LLM이 평가한 자체 신뢰도
  confidence?: "high" | "medium" | "low";
  // LLM이 남기는 추가 메모 (제약 사항/예외 등)
  notes?: string;
}

// ───────────────────────────────────────────────────
// zod 스키마
// LLM 응답 JSON.parse 직후 검증.
// 알 수 없는 필드는 거부하지 않음(.strip 기본 동작) — 향후 필드 확장 대비.
// ───────────────────────────────────────────────────
export const NormalizedRuleSchema: z.ZodType<NormalizedRule> = z.object({
  ageRange: z
    .object({
      min: z.number().int().min(0).max(120).optional(),
      max: z.number().int().min(0).max(120).optional(),
    })
    .optional(),
  regions: z.array(z.string().regex(/^\d{5}$/)).optional(),
  requiredFlags: z.array(z.enum(AVAILABLE_FLAGS)).optional(),
  excludedFlags: z.array(z.enum(AVAILABLE_FLAGS)).optional(),
  incomeBracketMaxRatio: z.number().min(0).max(500).optional(),
  housingType: z
    .array(z.enum(["owned", "lease", "monthlyRent", "publicRental", "other"]))
    .optional(),
  basicLivelihoodTypes: z
    .array(z.enum(["livelihood", "medical", "housing", "education"]))
    .optional(),
  disabilityRequired: z.boolean().optional(),
  hasBusinessRequired: z.boolean().optional(),
  industries: z.array(z.string()).optional(),
  maxAnnualRevenueKrw: z.number().int().min(0).optional(),
  genderOnly: z.enum(["male", "female"]).optional(),
  targetSummary: z.string().max(500).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  notes: z.string().max(1000).optional(),
});
