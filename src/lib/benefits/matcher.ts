// 정부 혜택 매칭 엔진
// Benefit.eligibilityRules는 출처(GOV24 등)에서 받아온 자유텍스트 위주.
// 1순위: Benefit.normalizedRules(LLM 정형화 결과) — 정확도 높음, 큰 가중치
// 2순위: 키워드 룰 fallback — normalizedRules 없거나 confidence=low일 때
import type { BenefitProfile } from "./types";
import { NormalizedRuleSchema, type NormalizedRule } from "./ruleSchema";
import { kstCurrentYear } from "@/lib/kst";

// ───────────────────────────────────────────────────
// 키워드 룰 정의
// 각 룰은 자유텍스트(eligibilityRules의 모든 값을 합친 문자열)를 검사하고
// profile을 보고 충족/불충족/판단불가/필요필드를 판단한다.
// ───────────────────────────────────────────────────

type RuleResult =
  | { kind: "match"; score: number; reason: string }
  | { kind: "mismatch"; reason: string } // 명백히 자격 없음
  | { kind: "missing"; field: string; reason: string } // 평가 필요한데 정보 없음
  | { kind: "skip" }; // 키워드가 안 잡혀서 룰 자체가 비활성

type Rule = {
  id: string;
  // 룰 트리거 키워드 (하나라도 포함되면 평가)
  keywords: string[];
  // 룰 평가 함수
  evaluate: (profile: BenefitProfile) => RuleResult;
  // 룰 가중치 (점수 산정 시 사용)
  weight: number;
};

// 현재 연도 기준 만 나이 계산 (한국식 만 나이는 생일 미반영 단순 계산)
function ageFromBirthYear(birthYear?: number): number | null {
  if (!birthYear) return null;
  return kstCurrentYear() - birthYear;
}

// 텍스트에 키워드가 하나라도 포함되는지 확인
function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

const RULES: Rule[] = [
  // ── 연령 (1~6) ────────────────────────────────
  {
    id: "youth",
    keywords: ["청년", "만 19~39", "만19~39", "19세 이상 39세 이하", "만 39세 이하", "만39세 이하"],
    weight: 12,
    evaluate: (p) => {
      const age = ageFromBirthYear(p.demographics.birthYear);
      if (age === null)
        return { kind: "missing", field: "demographics.birthYear", reason: "청년 자격 확인을 위해 출생연도 필요" };
      if (age >= 19 && age <= 39)
        return { kind: "match", score: 12, reason: `청년(만 ${age}세) 자격 충족` };
      return { kind: "mismatch", reason: `청년 대상이 아님(만 ${age}세)` };
    },
  },
  {
    id: "elderly65",
    keywords: ["만 65세 이상", "만65세 이상", "노인", "어르신", "65세 이상"],
    weight: 12,
    evaluate: (p) => {
      const age = ageFromBirthYear(p.demographics.birthYear);
      if (age === null)
        return { kind: "missing", field: "demographics.birthYear", reason: "노인 자격 확인을 위해 출생연도 필요" };
      if (age >= 65)
        return { kind: "match", score: 12, reason: `만 ${age}세 노인 자격 충족` };
      return { kind: "mismatch", reason: `만 65세 이상 대상(현재 만 ${age}세)` };
    },
  },
  {
    id: "midage",
    keywords: ["중장년", "40~64세", "만 40세 이상", "만40세 이상"],
    weight: 8,
    evaluate: (p) => {
      const age = ageFromBirthYear(p.demographics.birthYear);
      if (age === null)
        return { kind: "missing", field: "demographics.birthYear", reason: "중장년 자격 확인을 위해 출생연도 필요" };
      if (age >= 40 && age <= 64)
        return { kind: "match", score: 8, reason: `중장년(만 ${age}세) 자격 충족` };
      return { kind: "mismatch", reason: `중장년 대상이 아님(만 ${age}세)` };
    },
  },
  {
    id: "child",
    keywords: ["아동", "만 18세 이하", "만18세 이하", "어린이"],
    weight: 8,
    evaluate: (p) => {
      const hasChild = p.children.children.length > 0;
      if (!hasChild)
        return { kind: "missing", field: "children", reason: "아동 대상 — 자녀 정보 필요" };
      return { kind: "match", score: 8, reason: "자녀가 있어 아동 대상 가능" };
    },
  },
  {
    id: "infant",
    keywords: ["영유아", "영아", "유아", "만 5세 이하", "만5세 이하"],
    weight: 8,
    evaluate: (p) => {
      const has = p.children.children.some(
        (c) => c.stage === "infant" || c.stage === "preschool",
      );
      if (!has && p.children.children.length === 0)
        return { kind: "missing", field: "children", reason: "영유아 대상 — 자녀 정보 필요" };
      if (!has)
        return { kind: "mismatch", reason: "영유아 자녀가 없음" };
      return { kind: "match", score: 8, reason: "영유아 자녀 보유" };
    },
  },
  {
    id: "teen",
    keywords: ["청소년", "중·고등학생", "중고등학생"],
    weight: 6,
    evaluate: (p) => {
      const has = p.children.children.some(
        (c) => c.stage === "middle" || c.stage === "high",
      );
      if (!has && p.children.children.length === 0)
        return { kind: "missing", field: "children", reason: "청소년 대상 — 자녀 정보 필요" };
      if (!has) return { kind: "mismatch", reason: "청소년 자녀 없음" };
      return { kind: "match", score: 6, reason: "청소년 자녀 보유" };
    },
  },

  // ── 가구 형태 (7~14) ──────────────────────────
  {
    id: "singleParent",
    keywords: ["한부모", "모자가정", "부자가정", "조손가정"],
    weight: 14,
    evaluate: (p) => {
      if (p.household.isSingleParent === true)
        return { kind: "match", score: 14, reason: "한부모가족 자격 충족" };
      if (p.household.isSingleParent === false)
        return { kind: "mismatch", reason: "한부모가족 대상이 아님" };
      return { kind: "missing", field: "household.isSingleParent", reason: "한부모가족 여부 필요" };
    },
  },
  {
    id: "multiChild",
    keywords: ["다자녀", "다자녀가구", "셋째 이상", "3자녀 이상", "세 자녀 이상"],
    weight: 12,
    evaluate: (p) => {
      if (p.household.isMultiChild === true)
        return { kind: "match", score: 12, reason: "다자녀가구 자격 충족" };
      if (p.children.children.length >= 3)
        return { kind: "match", score: 12, reason: `자녀 ${p.children.children.length}명으로 다자녀 충족` };
      if (p.household.isMultiChild === false)
        return { kind: "mismatch", reason: "다자녀가구 대상이 아님" };
      return { kind: "missing", field: "household.isMultiChild", reason: "다자녀가구 여부 필요" };
    },
  },
  {
    id: "multicultural",
    keywords: ["다문화", "결혼이민", "다문화가족"],
    weight: 12,
    evaluate: (p) => {
      if (p.household.isMulticultural === true)
        return { kind: "match", score: 12, reason: "다문화가족 자격 충족" };
      if (p.household.isMulticultural === false)
        return { kind: "mismatch", reason: "다문화가족 대상이 아님" };
      return { kind: "missing", field: "household.isMulticultural", reason: "다문화가족 여부 필요" };
    },
  },
  {
    id: "northKorean",
    keywords: ["북한이탈주민", "탈북민", "새터민"],
    weight: 14,
    evaluate: (p) => {
      if (p.household.isNorthKoreanDefector === true)
        return { kind: "match", score: 14, reason: "북한이탈주민 자격 충족" };
      if (p.household.isNorthKoreanDefector === false)
        return { kind: "mismatch", reason: "북한이탈주민 대상이 아님" };
      return { kind: "missing", field: "household.isNorthKoreanDefector", reason: "북한이탈주민 여부 필요" };
    },
  },
  {
    id: "newlywed",
    keywords: ["신혼", "신혼부부", "혼인 7년 이내", "혼인7년 이내"],
    weight: 12,
    evaluate: (p) => {
      if (p.household.isNewlywed === true)
        return { kind: "match", score: 12, reason: "신혼부부 자격 충족" };
      if (p.household.isNewlywed === false)
        return { kind: "mismatch", reason: "신혼부부 대상이 아님" };
      return { kind: "missing", field: "household.isNewlywed", reason: "신혼부부 여부 필요" };
    },
  },
  {
    id: "singlePerson",
    keywords: ["1인가구", "1인 가구", "독거"],
    weight: 10,
    evaluate: (p) => {
      if (p.household.isSinglePerson === true || p.demographics.householdSize === 1)
        return { kind: "match", score: 10, reason: "1인 가구 자격 충족" };
      if (p.household.isSinglePerson === false)
        return { kind: "mismatch", reason: "1인 가구 대상이 아님" };
      return { kind: "missing", field: "household.isSinglePerson", reason: "1인 가구 여부 필요" };
    },
  },
  {
    id: "grandparentRaising",
    keywords: ["조손가구", "조손가족"],
    weight: 12,
    evaluate: (p) => {
      if (p.household.isGrandparentRaising === true)
        return { kind: "match", score: 12, reason: "조손가구 자격 충족" };
      if (p.household.isGrandparentRaising === false)
        return { kind: "mismatch", reason: "조손가구 대상이 아님" };
      return { kind: "missing", field: "household.isGrandparentRaising", reason: "조손가구 여부 필요" };
    },
  },
  {
    id: "marriedCouple",
    keywords: ["기혼", "부부"],
    weight: 4,
    evaluate: (p) => {
      const ms = p.demographics.maritalStatus;
      if (ms === "married")
        return { kind: "match", score: 4, reason: "기혼 자격 충족" };
      if (ms) return { kind: "mismatch", reason: "기혼 대상이 아님" };
      return { kind: "missing", field: "demographics.maritalStatus", reason: "혼인 상태 필요" };
    },
  },

  // ── 복지 자격 (15~22) ─────────────────────────
  {
    id: "basicLivelihood",
    keywords: ["기초생활수급", "기초생활보장", "수급자", "생계급여", "주거급여", "의료급여", "교육급여"],
    weight: 16,
    evaluate: (p) => {
      const t = p.welfareStatus.basicLivelihoodType;
      if (t && t !== "none")
        return { kind: "match", score: 16, reason: `기초생활수급(${t}) 자격 충족` };
      if (t === "none")
        return { kind: "mismatch", reason: "기초생활수급 대상이 아님" };
      return { kind: "missing", field: "welfareStatus.basicLivelihoodType", reason: "기초생활수급 정보 필요" };
    },
  },
  {
    id: "nearPoor",
    keywords: ["차상위", "차상위계층"],
    weight: 14,
    evaluate: (p) => {
      if (p.welfareStatus.isNearPoor === true)
        return { kind: "match", score: 14, reason: "차상위계층 자격 충족" };
      if (p.welfareStatus.isNearPoor === false)
        return { kind: "mismatch", reason: "차상위계층 대상이 아님" };
      return { kind: "missing", field: "welfareStatus.isNearPoor", reason: "차상위계층 여부 필요" };
    },
  },
  {
    id: "disability",
    keywords: ["장애인", "장애"],
    weight: 14,
    evaluate: (p) => {
      const g = p.welfareStatus.disabilityGrade;
      if (g === "severe" || g === "mild")
        return { kind: "match", score: 14, reason: "장애인 자격 충족" };
      if (g === "none")
        return { kind: "mismatch", reason: "장애인 등록 정보 없음" };
      return { kind: "missing", field: "welfareStatus.disabilityGrade", reason: "장애 등록 정보 필요" };
    },
  },
  {
    id: "severeDisability",
    keywords: ["중증장애", "심한 장애"],
    weight: 12,
    evaluate: (p) => {
      if (p.welfareStatus.disabilityGrade === "severe")
        return { kind: "match", score: 12, reason: "중증장애 자격 충족" };
      if (p.welfareStatus.disabilityGrade)
        return { kind: "mismatch", reason: "중증장애 대상이 아님" };
      return { kind: "missing", field: "welfareStatus.disabilityGrade", reason: "장애 등급 정보 필요" };
    },
  },
  {
    id: "veteran",
    keywords: ["국가유공자", "보훈", "보훈대상자"],
    weight: 14,
    evaluate: (p) => {
      if (p.welfareStatus.isVeteran === true || p.welfareStatus.isHonorRecipient === true)
        return { kind: "match", score: 14, reason: "국가유공자/보훈대상자 자격 충족" };
      if (p.welfareStatus.isVeteran === false && p.welfareStatus.isHonorRecipient === false)
        return { kind: "mismatch", reason: "보훈대상자 아님" };
      return { kind: "missing", field: "welfareStatus.isVeteran", reason: "보훈대상자 여부 필요" };
    },
  },
  {
    id: "incomeBelow50",
    keywords: ["중위소득 50%", "중위소득50%"],
    weight: 10,
    evaluate: (p) => {
      const r = p.incomeAssets.incomeBracketRatio;
      if (r === undefined)
        return { kind: "missing", field: "incomeAssets.incomeBracketRatio", reason: "소득 정보 필요" };
      if (r <= 50) return { kind: "match", score: 10, reason: `중위소득 ${r}%로 자격 충족` };
      return { kind: "mismatch", reason: `중위소득 ${r}%로 50% 초과` };
    },
  },
  {
    id: "incomeBelow75",
    keywords: ["중위소득 75%", "중위소득75%"],
    weight: 10,
    evaluate: (p) => {
      const r = p.incomeAssets.incomeBracketRatio;
      if (r === undefined)
        return { kind: "missing", field: "incomeAssets.incomeBracketRatio", reason: "소득 정보 필요" };
      if (r <= 75) return { kind: "match", score: 10, reason: `중위소득 ${r}%로 자격 충족` };
      return { kind: "mismatch", reason: `중위소득 ${r}%로 75% 초과` };
    },
  },
  {
    id: "incomeBelow100",
    keywords: ["중위소득 100%", "중위소득100%"],
    weight: 10,
    evaluate: (p) => {
      const r = p.incomeAssets.incomeBracketRatio;
      if (r === undefined)
        return { kind: "missing", field: "incomeAssets.incomeBracketRatio", reason: "소득 정보 필요" };
      if (r <= 100) return { kind: "match", score: 10, reason: `중위소득 ${r}%로 자격 충족` };
      return { kind: "mismatch", reason: `중위소득 ${r}%로 100% 초과` };
    },
  },

  // ── 임신/출산/건강 (23~26) ────────────────────
  {
    id: "pregnant",
    keywords: ["임신", "임산부", "출산", "임신부"],
    weight: 14,
    evaluate: (p) => {
      if (p.health.isPregnant === true)
        return { kind: "match", score: 14, reason: "임신/출산 대상 충족" };
      if (p.health.isPregnant === false)
        return { kind: "mismatch", reason: "임산부 대상이 아님" };
      return { kind: "missing", field: "health.isPregnant", reason: "임신 여부 필요" };
    },
  },
  {
    id: "chronic",
    keywords: ["만성질환", "지속질환", "당뇨", "고혈압"],
    weight: 8,
    evaluate: (p) => {
      if (p.health.hasChronicCondition === true)
        return { kind: "match", score: 8, reason: "만성질환 보유 자격 충족" };
      if (p.health.hasChronicCondition === false)
        return { kind: "mismatch", reason: "만성질환 대상이 아님" };
      return { kind: "missing", field: "health.hasChronicCondition", reason: "만성질환 여부 필요" };
    },
  },
  {
    id: "infantParent",
    keywords: ["영아 부모", "출산 가구", "산후"],
    weight: 8,
    evaluate: (p) => {
      const has = p.children.children.some((c) => c.stage === "infant");
      if (has) return { kind: "match", score: 8, reason: "영아 자녀 보유" };
      if (p.children.children.length === 0)
        return { kind: "missing", field: "children", reason: "영아 자녀 정보 필요" };
      return { kind: "mismatch", reason: "영아 자녀 없음" };
    },
  },
  {
    id: "delivery",
    keywords: ["출산예정"],
    weight: 8,
    evaluate: (p) => {
      if (p.health.expectedDeliveryDate)
        return { kind: "match", score: 8, reason: "출산예정 자격 충족" };
      if (p.health.isPregnant === false)
        return { kind: "mismatch", reason: "출산예정 대상 아님" };
      return { kind: "missing", field: "health.expectedDeliveryDate", reason: "출산예정일 필요" };
    },
  },

  // ── 사업자 (27~33) ────────────────────────────
  {
    id: "selfEmployed",
    keywords: ["자영업", "자영업자", "개인사업자"],
    weight: 14,
    evaluate: (p) => {
      if (p.business.hasBusiness === true)
        return { kind: "match", score: 14, reason: "자영업/사업자 자격 충족" };
      if (p.business.hasBusiness === false)
        return { kind: "mismatch", reason: "사업자 대상이 아님" };
      return { kind: "missing", field: "business.hasBusiness", reason: "사업자 여부 필요" };
    },
  },
  {
    id: "smallMerchant",
    keywords: ["소상공인"],
    weight: 14,
    evaluate: (p) => {
      if (p.business.hasBusiness === true && p.business.businessSize === "smallMerchant")
        return { kind: "match", score: 14, reason: "소상공인 자격 충족" };
      if (p.business.hasBusiness === true)
        return { kind: "match", score: 8, reason: "사업자(소상공인 가능성)" };
      if (p.business.hasBusiness === false)
        return { kind: "mismatch", reason: "소상공인 대상 아님" };
      return { kind: "missing", field: "business.hasBusiness", reason: "사업자 정보 필요" };
    },
  },
  {
    id: "sme",
    keywords: ["중소기업", "중기업", "스타트업"],
    weight: 12,
    evaluate: (p) => {
      if (p.business.businessSize === "sme")
        return { kind: "match", score: 12, reason: "중소기업 자격 충족" };
      if (p.business.hasBusiness === true)
        return { kind: "match", score: 6, reason: "사업자(중소기업 가능성)" };
      if (p.business.hasBusiness === false)
        return { kind: "mismatch", reason: "중소기업 대상 아님" };
      return { kind: "missing", field: "business.businessSize", reason: "사업체 규모 필요" };
    },
  },
  {
    id: "midMarket",
    keywords: ["중견기업"],
    weight: 10,
    evaluate: (p) => {
      if (p.business.businessSize === "midMarket")
        return { kind: "match", score: 10, reason: "중견기업 자격 충족" };
      if (p.business.hasBusiness === false)
        return { kind: "mismatch", reason: "중견기업 대상 아님" };
      return { kind: "missing", field: "business.businessSize", reason: "사업체 규모 필요" };
    },
  },
  {
    id: "founder",
    keywords: ["창업", "예비창업", "창업자"],
    weight: 12,
    evaluate: (p) => {
      const year = p.business.openYear;
      if (year && year >= kstCurrentYear() - 7)
        return { kind: "match", score: 12, reason: "창업기업(7년 이내) 자격 충족" };
      if (p.business.hasBusiness === true)
        return { kind: "match", score: 4, reason: "기존 사업자(창업 자격은 별도 검토)" };
      if (p.business.hasBusiness === false)
        return { kind: "match", score: 6, reason: "예비창업자 가능성" };
      return { kind: "missing", field: "business.hasBusiness", reason: "사업자 정보 필요" };
    },
  },
  {
    id: "merchant",
    keywords: ["전통시장", "상점가"],
    weight: 8,
    evaluate: (p) => {
      if (p.business.industry?.includes("도소매") || p.business.industry?.includes("외식"))
        return { kind: "match", score: 8, reason: "도소매/외식업 자격 가능" };
      if (p.business.hasBusiness === true)
        return { kind: "match", score: 4, reason: "사업자 — 업종 확인 필요" };
      if (p.business.hasBusiness === false)
        return { kind: "mismatch", reason: "전통시장/상점가 대상 아님" };
      return { kind: "missing", field: "business.industry", reason: "사업자 업종 정보 필요" };
    },
  },
  {
    id: "manufacturing",
    keywords: ["제조업", "제조"],
    weight: 8,
    evaluate: (p) => {
      if (p.business.industry?.includes("제조"))
        return { kind: "match", score: 8, reason: "제조업 자격 충족" };
      if (p.business.hasBusiness === false)
        return { kind: "mismatch", reason: "제조업 대상 아님" };
      return { kind: "missing", field: "business.industry", reason: "업종 정보 필요" };
    },
  },

  // ── 농어업/특수 (34~38) ───────────────────────
  {
    id: "farmer",
    keywords: ["농업인", "농업", "농민"],
    weight: 12,
    evaluate: (p) => {
      if (p.special.isFarmer === true)
        return { kind: "match", score: 12, reason: "농업인 자격 충족" };
      if (p.special.isFarmer === false)
        return { kind: "mismatch", reason: "농업인 대상이 아님" };
      return { kind: "missing", field: "special.isFarmer", reason: "농업인 여부 필요" };
    },
  },
  {
    id: "fisher",
    keywords: ["어업인", "어민"],
    weight: 10,
    evaluate: (p) => {
      if (p.business.industry?.includes("어업"))
        return { kind: "match", score: 10, reason: "어업 종사 자격" };
      return { kind: "skip" };
    },
  },
  {
    id: "foreigner",
    keywords: ["외국인", "결혼이민자"],
    weight: 10,
    evaluate: (p) => {
      if (p.special.isForeigner === true)
        return { kind: "match", score: 10, reason: "외국인 자격 충족" };
      if (p.special.isForeigner === false)
        return { kind: "mismatch", reason: "외국인 대상 아님" };
      return { kind: "missing", field: "special.isForeigner", reason: "외국인 여부 필요" };
    },
  },
  {
    id: "dischargedSoldier",
    keywords: ["제대군인", "예비역", "전역"],
    weight: 10,
    evaluate: (p) => {
      if (p.special.militaryStatus === "discharged")
        return { kind: "match", score: 10, reason: "제대군인 자격 충족" };
      if (p.special.militaryStatus)
        return { kind: "mismatch", reason: "제대군인 대상이 아님" };
      return { kind: "missing", field: "special.militaryStatus", reason: "병역 상태 필요" };
    },
  },
  {
    id: "servingSoldier",
    keywords: ["현역", "현역병", "복무중"],
    weight: 8,
    evaluate: (p) => {
      if (p.special.militaryStatus === "serving")
        return { kind: "match", score: 8, reason: "현역 복무중 자격" };
      if (p.special.militaryStatus)
        return { kind: "mismatch", reason: "현역 대상이 아님" };
      return { kind: "missing", field: "special.militaryStatus", reason: "병역 상태 필요" };
    },
  },

  // ── 고용 (39~44) ──────────────────────────────
  {
    id: "jobseeker",
    keywords: ["구직자", "구직", "취업준비"],
    weight: 12,
    evaluate: (p) => {
      if (p.employment.status === "jobseeking")
        return { kind: "match", score: 12, reason: "구직자 자격 충족" };
      if (p.employment.status)
        return { kind: "mismatch", reason: "구직자 대상이 아님" };
      return { kind: "missing", field: "employment.status", reason: "고용 상태 필요" };
    },
  },
  {
    id: "unemployed",
    keywords: ["실업자", "미취업", "실직"],
    weight: 12,
    evaluate: (p) => {
      if (p.employment.status === "unemployed" || p.employment.status === "jobseeking")
        return { kind: "match", score: 12, reason: "미취업/실업 자격 충족" };
      if (p.employment.status)
        return { kind: "mismatch", reason: "미취업 대상이 아님" };
      return { kind: "missing", field: "employment.status", reason: "고용 상태 필요" };
    },
  },
  {
    id: "student",
    keywords: ["재학생", "학생", "대학생", "대학교 재학"],
    weight: 10,
    evaluate: (p) => {
      if (p.employment.status === "student" || p.education.isCurrentlyEnrolled === true)
        return { kind: "match", score: 10, reason: "재학생 자격 충족" };
      if (p.employment.status)
        return { kind: "mismatch", reason: "재학생 대상이 아님" };
      return { kind: "missing", field: "employment.status", reason: "재학 여부 필요" };
    },
  },
  {
    id: "careerInterrupted",
    keywords: ["경력단절", "경단녀", "경력단절여성"],
    weight: 12,
    evaluate: (p) => {
      if (p.employment.isCareerInterrupted === true)
        return { kind: "match", score: 12, reason: "경력단절 자격 충족" };
      if (p.employment.isCareerInterrupted === false)
        return { kind: "mismatch", reason: "경력단절 대상이 아님" };
      return { kind: "missing", field: "employment.isCareerInterrupted", reason: "경력단절 여부 필요" };
    },
  },
  {
    id: "regular",
    keywords: ["정규직", "근로자"],
    weight: 6,
    evaluate: (p) => {
      if (p.employment.employmentType === "regular")
        return { kind: "match", score: 6, reason: "정규직 자격" };
      if (p.employment.status === "employed")
        return { kind: "match", score: 3, reason: "재직 중" };
      if (p.employment.status)
        return { kind: "mismatch", reason: "정규직 대상 아님" };
      return { kind: "missing", field: "employment.employmentType", reason: "고용 형태 필요" };
    },
  },
  {
    id: "platform",
    keywords: ["특수고용", "플랫폼노동", "플랫폼 종사자", "프리랜서"],
    weight: 10,
    evaluate: (p) => {
      const t = p.employment.employmentType;
      if (t === "platform" || t === "freelance")
        return { kind: "match", score: 10, reason: "특수고용/플랫폼 노동자 자격" };
      if (t)
        return { kind: "mismatch", reason: "특수고용 대상 아님" };
      return { kind: "missing", field: "employment.employmentType", reason: "고용 형태 필요" };
    },
  },

  // ── 주거 (45~48) ──────────────────────────────
  {
    id: "noHome",
    keywords: ["무주택", "무주택자", "무주택세대"],
    weight: 12,
    evaluate: (p) => {
      if (p.incomeAssets.ownsHome === false)
        return { kind: "match", score: 12, reason: "무주택 자격 충족" };
      if (p.incomeAssets.ownsHome === true)
        return { kind: "mismatch", reason: "주택 보유 — 무주택 대상 아님" };
      return { kind: "missing", field: "incomeAssets.ownsHome", reason: "주택 보유 여부 필요" };
    },
  },
  {
    id: "publicRental",
    keywords: ["공공임대", "임대주택"],
    weight: 8,
    evaluate: (p) => {
      if (p.residence.housingType === "publicRental")
        return { kind: "match", score: 8, reason: "공공임대 거주 자격" };
      if (p.residence.housingType)
        return { kind: "mismatch", reason: "공공임대 거주가 아님" };
      return { kind: "missing", field: "residence.housingType", reason: "주거 형태 필요" };
    },
  },
  {
    id: "monthlyRent",
    keywords: ["월세", "주거비"],
    weight: 8,
    evaluate: (p) => {
      if (p.residence.housingType === "monthlyRent")
        return { kind: "match", score: 8, reason: "월세 거주 자격" };
      if (p.residence.housingType)
        return { kind: "mismatch", reason: "월세 거주가 아님" };
      return { kind: "missing", field: "residence.housingType", reason: "주거 형태 필요" };
    },
  },
  {
    id: "lease",
    keywords: ["전세", "전세보증"],
    weight: 8,
    evaluate: (p) => {
      if (p.residence.housingType === "lease")
        return { kind: "match", score: 8, reason: "전세 거주 자격" };
      if (p.residence.housingType)
        return { kind: "mismatch", reason: "전세 거주가 아님" };
      return { kind: "missing", field: "residence.housingType", reason: "주거 형태 필요" };
    },
  },

  // ── 교육 (49~51) ──────────────────────────────
  {
    id: "studentLoan",
    keywords: ["학자금대출", "학자금"],
    weight: 8,
    evaluate: (p) => {
      if (p.education.hasStudentLoan === true)
        return { kind: "match", score: 8, reason: "학자금대출 자격 충족" };
      if (p.education.hasStudentLoan === false)
        return { kind: "mismatch", reason: "학자금대출 대상 아님" };
      return { kind: "missing", field: "education.hasStudentLoan", reason: "학자금대출 여부 필요" };
    },
  },
  {
    id: "highSchool",
    keywords: ["고등학생", "고등학교 재학"],
    weight: 6,
    evaluate: (p) => {
      const has = p.children.children.some((c) => c.stage === "high");
      if (has) return { kind: "match", score: 6, reason: "고등학생 자녀 보유" };
      if (p.education.educationLevel === "highSchool" && p.education.isCurrentlyEnrolled === true)
        return { kind: "match", score: 6, reason: "고등학교 재학 자격" };
      if (p.children.children.length === 0)
        return { kind: "missing", field: "children", reason: "고등학생 정보 필요" };
      return { kind: "mismatch", reason: "고등학생 대상 아님" };
    },
  },
  {
    id: "collegeStudent",
    keywords: ["대학원생", "대학원 재학"],
    weight: 6,
    evaluate: (p) => {
      if (p.education.educationLevel === "graduate" && p.education.isCurrentlyEnrolled === true)
        return { kind: "match", score: 6, reason: "대학원 재학 자격" };
      if (p.education.isCurrentlyEnrolled === false)
        return { kind: "mismatch", reason: "재학생 대상 아님" };
      return { kind: "missing", field: "education.educationLevel", reason: "교육 정보 필요" };
    },
  },
];

// ───────────────────────────────────────────────────
// 지역 매칭
// regionCodes에 "00000"이면 전국, 아니면 profile.regionCode와 비교
// 시도(앞 2자리) 또는 시군구(5자리) 일치
// ───────────────────────────────────────────────────
function evaluateRegion(
  benefitRegions: string[],
  profileRegionCode?: string,
): { match: boolean; reason: string; missing: boolean } {
  if (!benefitRegions || benefitRegions.length === 0)
    return { match: true, reason: "지역 제한 없음", missing: false };
  if (benefitRegions.includes("00000"))
    return { match: true, reason: "전국 대상", missing: false };
  if (!profileRegionCode)
    return {
      match: false,
      reason: "지역 제한 있음 — 거주지 정보 필요",
      missing: true,
    };
  // 시군구(5자리) 정확 일치
  if (benefitRegions.includes(profileRegionCode))
    return { match: true, reason: "거주지 시군구 일치", missing: false };
  // 시·도 단위 혜택만 시·도 일치로 매칭 (예: "11000"=서울시 전체)
  // 다른 시군구 단위 혜택(예: "11545"=금천구)은 같은 시·도라도 매칭 X
  const sido = profileRegionCode.slice(0, 2);
  const sidoLevelMatch = benefitRegions.some(
    (r) => r.endsWith("000") && r.slice(0, 2) === sido,
  );
  if (sidoLevelMatch)
    return { match: true, reason: "거주 시·도 단위 혜택", missing: false };
  return {
    match: false,
    reason: `거주 지역 불일치(혜택 제공 지역: ${benefitRegions.join(",")})`,
    missing: false,
  };
}

// ───────────────────────────────────────────────────
// 정형 룰 평가 (NormalizedRule)
// LLM이 정규화한 룰 1건 → profile과 비교.
// 매칭당 +30점(weight 큼), 명백 불일치는 hardMismatch로 분리.
// ───────────────────────────────────────────────────
const FLAG_WEIGHT = 30;

// AVAILABLE_FLAGS 키 → BenefitProfile에서 해당 boolean 값 추출
function readFlag(profile: BenefitProfile, flag: string): boolean | undefined {
  switch (flag) {
    case "isYouth":
      return profile.special.isYouth;
    case "hasBusiness":
      return profile.business.hasBusiness;
    case "isSinglePerson":
      return profile.household.isSinglePerson;
    case "isNewlywed":
      return profile.household.isNewlywed;
    case "isSingleParent":
      return profile.household.isSingleParent;
    case "isMultiChild":
      return profile.household.isMultiChild;
    case "isMulticultural":
      return profile.household.isMulticultural;
    case "isNorthKoreanDefector":
      return profile.household.isNorthKoreanDefector;
    case "isPregnant":
      return profile.health.isPregnant;
    case "hasChronicCondition":
      return profile.health.hasChronicCondition;
    case "isCurrentlyEnrolled":
      return profile.education.isCurrentlyEnrolled;
    case "hasStudentLoan":
      return profile.education.hasStudentLoan;
    case "isForeigner":
      return profile.special.isForeigner;
    case "isFarmer":
      return profile.special.isFarmer;
    case "isVeteran":
      return profile.welfareStatus.isVeteran;
    case "isHonorRecipient":
      return profile.welfareStatus.isHonorRecipient;
    case "isNearPoor":
      return profile.welfareStatus.isNearPoor;
    case "hasFourInsurances":
      return profile.employment.hasFourInsurances;
    case "isCareerInterrupted":
      return profile.employment.isCareerInterrupted;
    case "ownsHome":
      return profile.incomeAssets.ownsHome;
    case "ownsCar":
      return profile.incomeAssets.ownsCar;
    default:
      return undefined;
  }
}

// 플래그 키 → 사용자에게 보일 한국어 라벨 + 누락 시 입력 가이드 필드 경로
function flagLabel(flag: string): string {
  const labels: Record<string, string> = {
    isYouth: "청년",
    hasBusiness: "사업자",
    isSinglePerson: "1인 가구",
    isNewlywed: "신혼부부",
    isSingleParent: "한부모가족",
    isMultiChild: "다자녀",
    isMulticultural: "다문화가족",
    isNorthKoreanDefector: "북한이탈주민",
    isPregnant: "임신",
    hasChronicCondition: "만성질환",
    isCurrentlyEnrolled: "재학생",
    hasStudentLoan: "학자금대출",
    isForeigner: "외국인",
    isFarmer: "농업인",
    isVeteran: "보훈",
    isHonorRecipient: "보훈대상",
    isNearPoor: "차상위",
    hasFourInsurances: "4대보험 가입",
    isCareerInterrupted: "경력단절",
    ownsHome: "주택 보유",
    ownsCar: "차량 보유",
  };
  return labels[flag] ?? flag;
}

type NormalizedEvalResult = {
  score: number;
  hardMismatch: number;
  matchReasons: string[];
  mismatchReasons: string[];
  missingFields: string[];
};

function evaluateNormalized(
  profile: BenefitProfile,
  rule: NormalizedRule,
): NormalizedEvalResult {
  const matchReasons: string[] = [];
  const mismatchReasons: string[] = [];
  const missingFields: string[] = [];
  let score = 0;
  let hardMismatch = 0;

  // 연령 범위
  if (rule.ageRange) {
    const by = profile.demographics.birthYear;
    if (!by) {
      missingFields.push("demographics.birthYear");
    } else {
      const age = kstCurrentYear() - by;
      const min = rule.ageRange.min ?? 0;
      const max = rule.ageRange.max ?? 200;
      if (age >= min && age <= max) {
        score += FLAG_WEIGHT;
        matchReasons.push(`연령 만 ${age}세 (요건 ${min}~${max}세)`);
      } else {
        hardMismatch++;
        mismatchReasons.push(`연령 미달/초과 — 요건 만 ${min}~${max}세 (현재 ${age}세)`);
      }
    }
  }

  // 거주 지역 (regionCodes에 "00000" 있으면 전국 OK)
  if (rule.regions && rule.regions.length > 0) {
    if (rule.regions.includes("00000")) {
      // 전국 — 별도 가점 없음 (어차피 region check가 처리)
    } else {
      const code = profile.residence.regionCode;
      if (!code) {
        missingFields.push("residence.regionCode");
      } else {
        // 시군구 정확 일치 OR 시·도 단위 혜택("11000")만 시·도 일치 허용
        const sido = code.slice(0, 2);
        const matched =
          rule.regions.includes(code) ||
          rule.regions.some(
            (r) => r.endsWith("000") && r.slice(0, 2) === sido,
          );
        if (matched) {
          score += FLAG_WEIGHT;
          matchReasons.push("거주 지역 일치");
        } else {
          hardMismatch++;
          mismatchReasons.push(
            `거주 지역 불일치 — 대상 지역: ${rule.regions.join(", ")}`,
          );
        }
      }
    }
  }

  // requiredFlags — 모두 true여야 함
  if (rule.requiredFlags) {
    for (const flag of rule.requiredFlags) {
      const v = readFlag(profile, flag);
      const label = flagLabel(flag);
      if (v === true) {
        score += FLAG_WEIGHT;
        matchReasons.push(`${label} 충족`);
      } else if (v === false) {
        hardMismatch++;
        mismatchReasons.push(`${label} 요건 불충족`);
      } else {
        missingFields.push(flag);
      }
    }
  }

  // excludedFlags — true면 자격 박탈
  if (rule.excludedFlags) {
    for (const flag of rule.excludedFlags) {
      const v = readFlag(profile, flag);
      const label = flagLabel(flag);
      if (v === true) {
        hardMismatch++;
        mismatchReasons.push(`${label} — 제외 대상`);
      } else if (v === false) {
        score += Math.round(FLAG_WEIGHT / 2);
        matchReasons.push(`${label} 아님(제외 대상 아님)`);
      } else {
        missingFields.push(flag);
      }
    }
  }

  // 중위소득 비율
  if (rule.incomeBracketMaxRatio !== undefined) {
    const r = profile.incomeAssets.incomeBracketRatio;
    if (r === undefined) {
      missingFields.push("incomeAssets.incomeBracketRatio");
    } else if (r <= rule.incomeBracketMaxRatio) {
      score += FLAG_WEIGHT;
      matchReasons.push(
        `중위소득 ${r}% (기준 ${rule.incomeBracketMaxRatio}% 이하)`,
      );
    } else {
      hardMismatch++;
      mismatchReasons.push(
        `중위소득 ${r}% — 기준 ${rule.incomeBracketMaxRatio}% 초과`,
      );
    }
  }

  // 주거 형태
  if (rule.housingType && rule.housingType.length > 0) {
    const t = profile.residence.housingType;
    if (!t) {
      missingFields.push("residence.housingType");
    } else if (rule.housingType.includes(t)) {
      score += FLAG_WEIGHT;
      matchReasons.push(`주거 형태 일치 (${t})`);
    } else {
      hardMismatch++;
      mismatchReasons.push(
        `주거 형태 불일치 — 대상: ${rule.housingType.join(",")}`,
      );
    }
  }

  // 기초생활수급 종류
  if (rule.basicLivelihoodTypes && rule.basicLivelihoodTypes.length > 0) {
    const t = profile.welfareStatus.basicLivelihoodType;
    if (t === undefined) {
      missingFields.push("welfareStatus.basicLivelihoodType");
    } else if (t === "none") {
      hardMismatch++;
      mismatchReasons.push("기초생활수급 대상이 아님");
    } else if (rule.basicLivelihoodTypes.includes(t)) {
      score += FLAG_WEIGHT;
      matchReasons.push(`기초생활수급(${t}) 일치`);
    } else {
      hardMismatch++;
      mismatchReasons.push(
        `수급 종류 불일치 — 대상: ${rule.basicLivelihoodTypes.join(",")}`,
      );
    }
  }

  // 장애 등록
  if (rule.disabilityRequired === true) {
    const g = profile.welfareStatus.disabilityGrade;
    if (g === "severe" || g === "mild") {
      score += FLAG_WEIGHT;
      matchReasons.push("장애 등록 충족");
    } else if (g === "none") {
      hardMismatch++;
      mismatchReasons.push("장애 등록 필요 — 대상 아님");
    } else {
      missingFields.push("welfareStatus.disabilityGrade");
    }
  }

  // 사업자 등록
  if (rule.hasBusinessRequired === true) {
    const v = profile.business.hasBusiness;
    if (v === true) {
      score += FLAG_WEIGHT;
      matchReasons.push("사업자 등록 충족");
    } else if (v === false) {
      hardMismatch++;
      mismatchReasons.push("사업자 등록 필요 — 대상 아님");
    } else {
      missingFields.push("business.hasBusiness");
    }
  }

  // 업종
  if (rule.industries && rule.industries.length > 0) {
    const ind = profile.business.industry;
    if (!ind) {
      missingFields.push("business.industry");
    } else if (rule.industries.some((i) => ind.includes(i) || i.includes(ind))) {
      score += FLAG_WEIGHT;
      matchReasons.push(`업종 일치 (${ind})`);
    } else {
      hardMismatch++;
      mismatchReasons.push(
        `업종 불일치 — 대상: ${rule.industries.join(",")}`,
      );
    }
  }

  // 연매출 상한
  if (rule.maxAnnualRevenueKrw !== undefined) {
    const rev = profile.business.annualRevenueKrw;
    if (rev === undefined) {
      missingFields.push("business.annualRevenueKrw");
    } else if (rev <= rule.maxAnnualRevenueKrw) {
      score += FLAG_WEIGHT;
      matchReasons.push(
        `연매출 ${(rev / 1_0000).toLocaleString()}만원 (상한 충족)`,
      );
    } else {
      hardMismatch++;
      mismatchReasons.push(
        `연매출 상한 초과 — 한도 ${(rule.maxAnnualRevenueKrw / 1_0000).toLocaleString()}만원`,
      );
    }
  }

  // 성별 한정
  if (rule.genderOnly) {
    const g = profile.demographics.gender;
    if (!g) {
      missingFields.push("demographics.gender");
    } else if (g === rule.genderOnly) {
      score += FLAG_WEIGHT;
      matchReasons.push(
        `성별 일치 (${rule.genderOnly === "male" ? "남성" : "여성"} 대상)`,
      );
    } else {
      hardMismatch++;
      mismatchReasons.push(
        `${rule.genderOnly === "male" ? "남성" : "여성"} 한정 혜택`,
      );
    }
  }

  return { score, hardMismatch, matchReasons, mismatchReasons, missingFields };
}

// ───────────────────────────────────────────────────
// 메인 평가 함수
// ───────────────────────────────────────────────────
export function evaluateBenefit(
  profile: BenefitProfile,
  benefit: {
    eligibilityRules: any;
    normalizedRules?: any;
    targetType: string;
    regionCodes: string[];
    applyEndAt: Date | null;
  },
): {
  score: number;
  status: "matched" | "uncertain" | "notEligible";
  missingFields: string[];
  matchReasons: string[];
  mismatchReasons: string[];
} {
  const matchReasons: string[] = [];
  const mismatchReasons: string[] = [];
  const missingFields: string[] = [];

  // 1) 마감일 체크 — 과거면 즉시 notEligible
  if (benefit.applyEndAt && benefit.applyEndAt.getTime() < Date.now()) {
    return {
      score: 0,
      status: "notEligible",
      missingFields: [],
      matchReasons: [],
      mismatchReasons: ["신청 마감"],
    };
  }

  // 2) targetType 사전 필터 — business 대상인데 사업자 아니면 감점
  if (benefit.targetType === "business" && profile.business.hasBusiness === false) {
    mismatchReasons.push("사업자 대상 혜택 — 사업자가 아님");
  }

  // 3) 지역 매칭
  const region = evaluateRegion(benefit.regionCodes, profile.residence.regionCode);
  if (region.match) {
    matchReasons.push(region.reason);
  } else {
    mismatchReasons.push(region.reason);
    if (region.missing) missingFields.push("residence.regionCode");
  }

  // 4) 정형 룰(NormalizedRule) 우선 평가 — LLM 정형화 결과가 있으면 사용
  let triggeredRules = 0;
  let totalScore = 0;
  let maxPossible = 0;
  let mismatchHard = 0; // 명백한 자격 미달 횟수
  let usedNormalized = false;

  let normalizedRule: NormalizedRule | null = null;
  if (benefit.normalizedRules && typeof benefit.normalizedRules === "object") {
    const parsed = NormalizedRuleSchema.safeParse(benefit.normalizedRules);
    if (parsed.success) normalizedRule = parsed.data;
  }

  // confidence가 high/medium일 때만 정형 룰 신뢰. low면 키워드 fallback.
  const useNormalized =
    normalizedRule !== null &&
    (normalizedRule.confidence === undefined ||
      normalizedRule.confidence === "high" ||
      normalizedRule.confidence === "medium");

  if (useNormalized && normalizedRule) {
    const r = evaluateNormalized(profile, normalizedRule);
    totalScore += r.score;
    // maxPossible은 채워진 규칙 수 × FLAG_WEIGHT 추정 — 실제 평가된 만큼만
    const evaluated =
      r.matchReasons.length + r.mismatchReasons.length + r.missingFields.length;
    if (evaluated > 0) {
      triggeredRules += evaluated;
      maxPossible += evaluated * FLAG_WEIGHT;
      usedNormalized = true;
    }
    mismatchHard += r.hardMismatch;
    for (const m of r.matchReasons) matchReasons.push(`[정형] ${m}`);
    for (const m of r.mismatchReasons) mismatchReasons.push(`[정형] ${m}`);
    for (const f of r.missingFields) missingFields.push(f);

    // targetSummary가 있으면 한 줄 표시
    if (normalizedRule.targetSummary) {
      matchReasons.push(`대상: ${normalizedRule.targetSummary}`);
    }
  }

  // 5) 키워드 룰 평가 — 정형 룰을 못 썼거나 confidence=low일 때 fallback
  if (!usedNormalized) {
    const text = collectText(benefit.eligibilityRules);
    for (const rule of RULES) {
      if (!hasAny(text, rule.keywords)) continue;
      triggeredRules++;
      maxPossible += rule.weight;
      const result = rule.evaluate(profile);
      if (result.kind === "match") {
        totalScore += result.score;
        matchReasons.push(result.reason);
      } else if (result.kind === "mismatch") {
        mismatchReasons.push(result.reason);
        mismatchHard++;
      } else if (result.kind === "missing") {
        missingFields.push(result.field);
      }
      // skip은 무시
    }
  }

  // 6) 지역 매칭 보너스
  if (region.match && benefit.regionCodes && !benefit.regionCodes.includes("00000")) {
    totalScore += 10;
    maxPossible += 10;
  }

  // 7) status 결정
  let status: "matched" | "uncertain" | "notEligible";

  // 명백한 자격 미달이 매칭보다 많으면 notEligible
  if (mismatchHard > 0 && matchReasons.length === 0) {
    status = "notEligible";
  } else if (!region.match && !region.missing) {
    // 지역이 명백히 불일치 (정보 부족이 아니라)
    status = "notEligible";
  } else if (triggeredRules === 0) {
    // 키워드가 하나도 안 잡힘 — 자유텍스트라 판단 어려움
    status = "uncertain";
    mismatchReasons.push("자격 요건 자동 분석 어려움 — 상세 페이지 확인 필요");
  } else if (matchReasons.length > mismatchHard && matchReasons.length > 0) {
    status = "matched";
  } else {
    status = "uncertain";
  }

  // 8) 점수 정규화 (0~100)
  let score = 0;
  if (maxPossible > 0) {
    score = Math.round((totalScore / maxPossible) * 100);
  } else if (region.match) {
    score = 30; // 지역만 일치하면 기본 점수
  }
  // 자격 미달 페널티
  if (mismatchHard > 0) {
    score = Math.max(0, score - mismatchHard * 15);
  }
  score = Math.max(0, Math.min(100, score));

  // 마감 임박은 가산점 (D-7 이내)
  if (benefit.applyEndAt) {
    const daysLeft = Math.ceil((benefit.applyEndAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysLeft >= 0 && daysLeft <= 7 && status !== "notEligible") {
      score = Math.min(100, score + 5);
      matchReasons.push(`마감 ${daysLeft}일 전`);
    }
  }

  return {
    score,
    status,
    missingFields: Array.from(new Set(missingFields)),
    matchReasons,
    mismatchReasons,
  };
}

// eligibilityRules의 모든 문자열 값을 하나의 텍스트로 합치기
function collectText(rules: any): string {
  if (!rules) return "";
  if (typeof rules === "string") return rules;
  if (Array.isArray(rules)) return rules.map(collectText).join(" ");
  if (typeof rules === "object") return Object.values(rules).map(collectText).join(" ");
  return String(rules);
}

// 룰 개수 (테스트/문서용)
export const RULE_COUNT = RULES.length;
