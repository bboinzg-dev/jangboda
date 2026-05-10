// 정부혜택 매칭 엔진 — 만 나이 / 지역 / 마감일 / 사업자 필터의 핵심 분기 검증
// 회귀 시 사용자가 잘못된 매칭(받을 수 있는 혜택을 못 받거나 자격 없는데 신청)으로 직접 피해
import { describe, expect, it } from "vitest";
import { evaluateBenefit } from "./matcher";
import { BenefitProfileSchema } from "./types";

const emptyProfile = BenefitProfileSchema.parse({});

const baseProfile = (overrides: Record<string, unknown> = {}) =>
  BenefitProfileSchema.parse(overrides);

describe("evaluateBenefit", () => {
  it("마감일 지난 혜택은 즉시 notEligible", () => {
    const r = evaluateBenefit(emptyProfile, {
      eligibilityRules: { 지원대상: "전 국민" },
      targetType: "individual",
      regionCodes: ["00000"],
      applyEndAt: new Date("2020-01-01"),
    });
    expect(r.status).toBe("notEligible");
    expect(r.mismatchReasons).toContain("신청 마감");
  });

  it("청년(만 19~39) 룰 매칭 — 1995년생", () => {
    const profile = baseProfile({
      demographics: { birthYear: 1995 },
      residence: { regionCode: "11680" },
    });
    const r = evaluateBenefit(profile, {
      eligibilityRules: { 지원대상: "청년 만 19~39세 대상" },
      targetType: "individual",
      regionCodes: ["00000"],
      applyEndAt: null,
    });
    expect(r.status).toBe("matched");
    expect(r.matchReasons.some((m) => m.includes("청년"))).toBe(true);
  });

  it("청년 룰 — 60대는 mismatch (notEligible 또는 uncertain)", () => {
    const profile = baseProfile({
      demographics: { birthYear: 1960 },
      residence: { regionCode: "11680" },
    });
    const r = evaluateBenefit(profile, {
      eligibilityRules: { 지원대상: "청년 만 19~39세 대상" },
      targetType: "individual",
      regionCodes: ["00000"],
      applyEndAt: null,
    });
    expect(r.status).not.toBe("matched");
  });

  it("출생연도 미입력 시 missingFields에 포함", () => {
    const r = evaluateBenefit(emptyProfile, {
      eligibilityRules: { 지원대상: "청년 만 19~39세 대상" },
      targetType: "individual",
      regionCodes: ["00000"],
      applyEndAt: null,
    });
    expect(r.missingFields).toContain("demographics.birthYear");
  });

  it("거주지 시·도 단위 혜택은 같은 시·도면 매칭 (서울 11000 ↔ 강남구 11680)", () => {
    const profile = baseProfile({
      residence: { regionCode: "11680" }, // 강남구
    });
    const r = evaluateBenefit(profile, {
      eligibilityRules: { 지원대상: "서울시 거주" },
      targetType: "individual",
      regionCodes: ["11000"], // 서울시 전체
      applyEndAt: null,
    });
    // 지역만 일치 (다른 룰 미트리거) → uncertain 또는 matched
    expect(r.status).not.toBe("notEligible");
  });

  it("거주지 시군구 단위 혜택은 다른 구면 notEligible", () => {
    const profile = baseProfile({
      residence: { regionCode: "11680" }, // 강남구
    });
    const r = evaluateBenefit(profile, {
      eligibilityRules: { 지원대상: "금천구 거주자" },
      targetType: "individual",
      regionCodes: ["11545"], // 금천구
      applyEndAt: null,
    });
    expect(r.status).toBe("notEligible");
  });

  it("사업자 대상 혜택인데 사업자 아니면 mismatch reason 있음", () => {
    const profile = baseProfile({
      business: { hasBusiness: false },
      residence: { regionCode: "11680" },
    });
    const r = evaluateBenefit(profile, {
      eligibilityRules: { 지원대상: "소상공인 자영업자" },
      targetType: "business",
      regionCodes: ["00000"],
      applyEndAt: null,
    });
    expect(r.mismatchReasons.some((m) => m.includes("사업자"))).toBe(true);
  });
});
