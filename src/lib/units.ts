// 상품 단위(unit) 문자열을 정규화해서 단가(원/100g, 원/1L 등) 비교를 가능하게 함
//
// 처리 가능한 패턴 예시:
//   "120g x 5개"   → 600g
//   "1L"           → 1000ml
//   "210g x 12개"  → 2520g
//   "30구"         → 30 (count)
//   "1.5L"         → 1500ml
//   "100g"         → 100g
//   "150g x 3캔"   → 450g
//   "300g"         → 300g
//
// 못 파싱한 경우 null 반환 — 단가 표시 안 함

export type Quantity = {
  /** 정규화된 수치 (g, ml, 또는 개수) */
  value: number;
  /** g | ml | count */
  unit: "g" | "ml" | "count";
  /** 사용자에게 표시할 라벨 (예: "100g당", "1L당", "1개당") */
  basisLabel: string;
  /** 단가 계산 시 분모 (예: 100g 기준이면 100, 1L 기준이면 1000) */
  basisDenominator: number;
};

const G_PATTERN = /(\d+(?:\.\d+)?)\s*(?:g|그램)/i;
const KG_PATTERN = /(\d+(?:\.\d+)?)\s*kg/i;
const ML_PATTERN = /(\d+(?:\.\d+)?)\s*ml/i;
const L_PATTERN = /(\d+(?:\.\d+)?)\s*[lL](?![a-z])/;
const COUNT_PATTERN = /(\d+)\s*(?:개|입|개입|구|봉|병|캔|팩)/;

const MULTIPLIER_PATTERN = /(\d+)\s*(?:개입|개|입|봉|병|캔|팩)/;

function extractWeight(unit: string): number | null {
  const kg = unit.match(KG_PATTERN);
  if (kg) return parseFloat(kg[1]) * 1000;
  const g = unit.match(G_PATTERN);
  if (g) return parseFloat(g[1]);
  return null;
}

function extractVolume(unit: string): number | null {
  const ml = unit.match(ML_PATTERN);
  if (ml) return parseFloat(ml[1]);
  const l = unit.match(L_PATTERN);
  if (l) return parseFloat(l[1]) * 1000;
  return null;
}

function extractMultiplier(unit: string): number {
  // "x 5개" 같은 부분 우선
  const m = unit.match(/[x×]\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  // 단독 "5개입" 같은 형태
  const single = unit.match(MULTIPLIER_PATTERN);
  if (single) return parseInt(single[1], 10);
  return 1;
}

export function parseUnit(unit: string): Quantity | null {
  if (!unit) return null;
  const cleaned = unit.replace(/\s+/g, " ").trim();

  const multiplier = extractMultiplier(cleaned);
  const weight = extractWeight(cleaned);
  if (weight !== null) {
    const total = weight * multiplier;
    // 100g 미만은 100g당 표기가 어색 → 1g당
    if (total < 100) {
      return { value: total, unit: "g", basisLabel: "1g당", basisDenominator: 1 };
    }
    return { value: total, unit: "g", basisLabel: "100g당", basisDenominator: 100 };
  }

  const volume = extractVolume(cleaned);
  if (volume !== null) {
    const total = volume * multiplier;
    if (total < 100) {
      return { value: total, unit: "ml", basisLabel: "1ml당", basisDenominator: 1 };
    }
    return { value: total, unit: "ml", basisLabel: "1L당", basisDenominator: 1000 };
  }

  // 무게/부피 없이 개수만 있는 경우 (예: "30구", "10개")
  const count = cleaned.match(COUNT_PATTERN);
  if (count) {
    return {
      value: parseInt(count[1], 10),
      unit: "count",
      basisLabel: "1개당",
      basisDenominator: 1,
    };
  }

  return null;
}

// 가격(원)과 단위를 받아 단가 문자열 반환 — 파싱 실패 시 null
export function unitPriceLabel(price: number, unit: string): string | null {
  const q = parseUnit(unit);
  if (!q || q.value <= 0) return null;
  const perUnit = (price * q.basisDenominator) / q.value;
  if (perUnit < 1) return null;
  return `${q.basisLabel} ${Math.round(perUnit).toLocaleString("ko-KR")}원`;
}

// 가격과 단위를 받아 단가 숫자(정렬용) 반환 — 파싱 실패 시 null
export function unitPriceValue(price: number, unit: string): number | null {
  const q = parseUnit(unit);
  if (!q || q.value <= 0) return null;
  return (price * q.basisDenominator) / q.value;
}
