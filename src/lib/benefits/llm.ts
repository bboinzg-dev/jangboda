// Google Gemini API로 자유텍스트 자격조건 → NormalizedRule 변환.
// 외부 SDK 미사용 — fetch로 generateContent 직접 호출.
// JSON 응답 강제(responseJsonSchema) + thinkingLevel="minimal" (정형화는 추론 거의 불필요).
// implicit caching: systemInstruction 동일 prefix는 Gemini가 자동 캐시.
import { AVAILABLE_FLAGS, NormalizedRuleSchema, type NormalizedRule } from "./ruleSchema";

const MODEL = "gemini-3-flash-preview";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// ───────────────────────────────────────────────────
// 시스템 지시 + 스키마 + few-shot — systemInstruction에 함께 넣어 implicit 캐시 적중률 극대화
// ───────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `당신은 한국 정부 지원사업 자격조건을 JSON으로 정규화하는 시스템입니다.
입력으로 정부 혜택의 자유텍스트(지원대상, 선정기준, 지원내용, 신청방법)가 주어집니다.
이 텍스트에서 명확하게 추출 가능한 자격 조건만 골라 정해진 JSON 스키마로 변환하세요.

규칙:
- 응답은 JSON 객체 하나만. 마크다운, 설명, 주석 금지.
- 텍스트에 명시되지 않은 필드는 누락(omit). 추측 금지.
- 모호하거나 해석 여지가 큰 경우 confidence는 "low".
- requiredFlags / excludedFlags는 허용 키 목록에서만 선택.
- regions는 5자리 행정구역코드. 전국이면 ["00000"].
- targetSummary는 한국어 1문장(60자 이내) — UI 카드에 그대로 표시됨.

# requiredFlags / excludedFlags 허용 키
${AVAILABLE_FLAGS.join(", ")}

# 예시 1
입력:
{
  "지원대상": "만 19세 이상 39세 이하 청년 중 미취업자",
  "선정기준": "거주지 무관, 중위소득 75% 이하 가구",
  "지원내용": "취업준비 활동비 월 50만원",
  "신청방법": "온라인 접수"
}
출력:
{"ageRange":{"min":19,"max":39},"regions":["00000"],"requiredFlags":["isYouth"],"incomeBracketMaxRatio":75,"targetSummary":"만 19~39세 미취업 청년(중위소득 75% 이하)","confidence":"high"}

# 예시 2
입력:
{
  "지원대상": "서울시 거주 한부모가족",
  "선정기준": "기초생활수급자(생계급여) 또는 차상위계층",
  "지원내용": "양육비 월 20만원",
  "신청방법": "주민센터 방문"
}
출력:
{"regions":["11000"],"requiredFlags":["isSingleParent"],"basicLivelihoodTypes":["livelihood"],"targetSummary":"서울 거주 한부모가족 중 생계급여 수급/차상위","confidence":"high","notes":"수급자 또는 차상위 — 둘 중 하나 충족"}

# 예시 3
입력:
{
  "지원대상": "관내 소상공인 중 외식업·도소매업 영위자",
  "선정기준": "사업자등록증 보유, 연매출 5억 이하, 주택 미보유 우대",
  "지원내용": "경영안정자금 최대 3천만원",
  "신청방법": "방문 접수"
}
출력:
{"hasBusinessRequired":true,"industries":["외식","도소매"],"maxAnnualRevenueKrw":500000000,"targetSummary":"관내 외식·도소매 소상공인(연매출 5억 이하)","confidence":"medium","notes":"주택 미보유는 우대 사항이므로 requiredFlags에 포함하지 않음"}`;

// ───────────────────────────────────────────────────
// JSON 응답 스키마 — Gemini가 강제로 이 형식만 반환
// (responseJsonSchema는 OpenAPI 3.0 subset 형식)
// ───────────────────────────────────────────────────
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    ageRange: {
      type: "object",
      properties: {
        min: { type: "integer" },
        max: { type: "integer" },
      },
    },
    regions: { type: "array", items: { type: "string" } },
    requiredFlags: {
      type: "array",
      items: { type: "string", enum: [...AVAILABLE_FLAGS] },
    },
    excludedFlags: {
      type: "array",
      items: { type: "string", enum: [...AVAILABLE_FLAGS] },
    },
    incomeBracketMaxRatio: { type: "number" },
    housingType: {
      type: "array",
      items: {
        type: "string",
        enum: ["owned", "lease", "monthlyRent", "publicRental", "other"],
      },
    },
    basicLivelihoodTypes: {
      type: "array",
      items: {
        type: "string",
        enum: ["livelihood", "medical", "housing", "education"],
      },
    },
    disabilityRequired: { type: "boolean" },
    hasBusinessRequired: { type: "boolean" },
    industries: { type: "array", items: { type: "string" } },
    maxAnnualRevenueKrw: { type: "integer" },
    genderOnly: { type: "string", enum: ["male", "female"] },
    targetSummary: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    notes: { type: "string" },
  },
} as const;

// ───────────────────────────────────────────────────
// API 호출 (1회 시도)
// ───────────────────────────────────────────────────
async function callOnce(userText: string, apiKey: string): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
      thinkingConfig: { thinkingLevel: "minimal" },
    },
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      cachedContentTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  // 토큰 사용량 로그 — implicit cache 적중률 추적
  if (data.usageMetadata) {
    const u = data.usageMetadata;
    console.log(
      `[llm] tokens in=${u.promptTokenCount ?? 0} out=${u.candidatesTokenCount ?? 0} cached=${u.cachedContentTokenCount ?? 0} total=${u.totalTokenCount ?? 0}`,
    );
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Gemini 응답에 text 블록 없음");
  return text;
}

// ───────────────────────────────────────────────────
// 외부 노출 함수
// 자유텍스트 입력 → NormalizedRule 출력
// 검증 실패 시 1회 재시도 (모델이 가끔 잘못된 enum 값을 내는 케이스 대응).
// ───────────────────────────────────────────────────
export async function normalizeEligibility(freeText: {
  지원대상?: string;
  선정기준?: string;
  지원내용?: string;
  신청방법?: string;
}): Promise<NormalizedRule> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey)
    throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");

  const userText = JSON.stringify(freeText, null, 2);

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const raw = await callOnce(userText, apiKey);
      const parsed = JSON.parse(raw);
      const validated = NormalizedRuleSchema.parse(parsed);
      return validated;
    } catch (e) {
      lastErr = e;
      console.warn(`[llm] 시도 ${attempt} 실패:`, (e as Error).message);
      // 재시도 전 짧은 대기 (rate limit 회피)
      if (attempt === 1) await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("정형화 실패");
}
