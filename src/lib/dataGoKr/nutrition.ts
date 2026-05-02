// data.go.kr 식품의약품안전처 식품영양성분DB (FoodNtrCpntDbInfo02) 어댑터
//
// 전체 275,856건이라 DB 적재 비효율 → 제품 상세 페이지에서 on-demand lookup.
// AMT_NUM1~50+ 컬럼이 영양소 값 — 표준 식품영양성분DB 매핑 적용 (xlsx 스펙 미보유 시 가정).
//
// 주의: foodsafety/ingredients.ts와는 별개 모듈. 다른 에이전트가 동시 작업 중이므로
// foodsafety 경로는 건드리지 않음.

import { readFileSync } from "node:fs";

const ENDPOINT =
  "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02";

export type NutritionFields = {
  energyKcal: number | null;
  waterG: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  sugarG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
  cholesterolMg: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  calciumMg: number | null;
  ironMg: number | null;
  potassiumMg: number | null;
  vitaminAUg: number | null;
  vitaminCMg: number | null;
};

export type NutritionLookupResult = {
  found: boolean;
  foodCode: string | null;
  foodName: string | null;
  category: string | null; // FOOD_CAT1_NM
  servingSize: string | null; // SERVING_SIZE 예: "100g"
  nutrition: NutritionFields | null;
  source: "datagokr" | "mock" | "none";
};

// data.go.kr 응답 타입 — 영양소는 AMT_NUM* 동적 키
type FoodItem = {
  FOOD_CD?: string;
  FOOD_NM_KR?: string;
  DB_GRP_NM?: string;
  FOOD_CAT1_NM?: string;
  FOOD_CAT2_NM?: string;
  SERVING_SIZE?: string;
  // AMT_NUM1, AMT_NUM2, ... (동적)
  [key: string]: string | undefined;
};

type ApiResponse = {
  header?: { resultCode?: string; resultMsg?: string };
  body?: {
    pageNo?: number;
    totalCount?: number;
    numOfRows?: number;
    items?: FoodItem[];
  };
};

// .env에서 DATA_GO_KR_SERVICE_KEY 읽기 — process.env가 비어 있는 환경(스크립트 등)을 위해 fallback.
function loadKey(): string | null {
  const fromEnv = process.env.DATA_GO_KR_SERVICE_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    const txt = readFileSync(".env", "utf8");
    const m = txt.match(/DATA_GO_KR_SERVICE_KEY\s*=\s*"?([^"\n\r]+)"?/);
    if (m) return m[1].trim();
  } catch {
    // .env 없을 수 있음
  }
  return null;
}

// AMT_NUM* 문자열을 number | null로 파싱
function toNum(v: string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "" || s === "-" || s.toLowerCase() === "n/a") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// 표준 식품영양성분DB AMT_NUM 매핑 (xlsx 스펙 부재 시 가정 — best-effort).
// AMT_NUM1=에너지, 2=수분, 3=단백질, 4=지방, 5=회분, 6=탄수화물, 7=당류, 8=식이섬유,
// 9=칼슘, 10=철, 11=인, 12=칼륨, 13=나트륨, 14=비타민A, 15=레티놀, 16=베타카로틴,
// 17=티아민, 18=리보플라빈, 19=니아신, 20=비타민C, 21=비타민D, 22=콜레스테롤,
// 23=포화지방산, 24=트랜스지방산
function extractNutrition(item: FoodItem): NutritionFields {
  return {
    energyKcal: toNum(item.AMT_NUM1),
    waterG: toNum(item.AMT_NUM2),
    proteinG: toNum(item.AMT_NUM3),
    fatG: toNum(item.AMT_NUM4),
    // AMT_NUM5 = 회분 (일반 사용자에게 큰 의미 없어 노출 생략)
    carbsG: toNum(item.AMT_NUM6),
    sugarG: toNum(item.AMT_NUM7),
    fiberG: toNum(item.AMT_NUM8),
    calciumMg: toNum(item.AMT_NUM9),
    ironMg: toNum(item.AMT_NUM10),
    // AMT_NUM11 = 인 (보통 라벨 노출 안 함)
    potassiumMg: toNum(item.AMT_NUM12),
    sodiumMg: toNum(item.AMT_NUM13),
    vitaminAUg: toNum(item.AMT_NUM14),
    vitaminCMg: toNum(item.AMT_NUM20),
    cholesterolMg: toNum(item.AMT_NUM22),
    saturatedFatG: toNum(item.AMT_NUM23),
    transFatG: toNum(item.AMT_NUM24),
  };
}

function emptyResult(): NutritionLookupResult {
  return {
    found: false,
    foodCode: null,
    foodName: null,
    category: null,
    servingSize: null,
    nutrition: null,
    source: "none",
  };
}

// 개발용 mock — API 키 없을 때
function mockResult(productName?: string): NutritionLookupResult {
  return {
    found: true,
    foodCode: "MOCK-0000-0000",
    foodName: productName ?? "샘플 음식",
    category: "샘플",
    servingSize: "100g",
    nutrition: {
      energyKcal: 137,
      waterG: 71.6,
      proteinG: 6.7,
      fatG: 5.16,
      carbsG: 15.94,
      sugarG: 1.2,
      fiberG: 0.5,
      sodiumMg: 181,
      cholesterolMg: 30,
      saturatedFatG: 1.8,
      transFatG: 0,
      calciumMg: 22,
      ironMg: 0.8,
      potassiumMg: 150,
      vitaminAUg: 5,
      vitaminCMg: 1,
    },
    source: "mock",
  };
}

// 한글 정규화 — 공백 제거, 소문자, 괄호/특수문자 제거
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // 괄호 안 내용
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[_\-·,.]/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

// 가장 긴 공통 부분문자열 길이
function longestCommonSubstringLen(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return 0;
  // dp[j] — 직전 행의 j 위치 값
  let prev = new Array<number>(n + 1).fill(0);
  let cur = new Array<number>(n + 1).fill(0);
  let best = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      } else {
        cur[j] = 0;
      }
    }
    [prev, cur] = [cur, prev];
    cur.fill(0);
  }
  return best;
}

function pickBestItem(
  items: FoodItem[],
  productName: string
): FoodItem | null {
  if (items.length === 0) return null;
  const want = normalize(productName);

  // 1) 정확 매치
  const exact = items.find((it) => normalize(it.FOOD_NM_KR ?? "") === want);
  if (exact) return exact;

  // 2) LCS 길이 최대
  let best: { item: FoodItem; score: number } | null = null;
  for (const it of items) {
    const cand = normalize(it.FOOD_NM_KR ?? "");
    const score = longestCommonSubstringLen(want, cand);
    if (!best || score > best.score) best = { item: it, score };
  }
  if (best && best.score >= 2) return best.item;

  // 3) 첫 항목
  return items[0];
}

async function fetchByName(
  serviceKey: string,
  foodName: string,
  useUppercaseKey: boolean
): Promise<{ items: FoodItem[]; resultCode: string } | null> {
  try {
    const params = new URLSearchParams();
    // data.go.kr endpoint은 lowercase serviceKey 우선이지만 대문자도 시도
    if (useUppercaseKey) params.set("ServiceKey", serviceKey);
    else params.set("serviceKey", serviceKey);
    params.set("type", "json");
    params.set("pageNo", "1");
    params.set("numOfRows", "10");
    params.set("FOOD_NM_KR", foodName);

    const url = `${ENDPOINT}?${params.toString()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    // 일부 data.go.kr 엔드포인트는 인증 실패 시 XML 에러를 던짐
    const text = await res.text();
    if (text.trim().startsWith("<")) {
      // XML — 인증 실패 가능성
      return { items: [], resultCode: "XML_ERROR" };
    }
    let json: ApiResponse;
    try {
      json = JSON.parse(text) as ApiResponse;
    } catch {
      return null;
    }
    const code = json.header?.resultCode ?? "";
    const items = json.body?.items ?? [];
    return { items, resultCode: code };
  } catch (e) {
    console.warn("[dataGoKr/nutrition] fetch 실패:", e);
    return null;
  }
}

// 검색어를 단계적으로 정제
function buildSearchCandidates(productName: string, brand?: string): string[] {
  const candidates: string[] = [];
  const trimmed = productName.trim();
  if (trimmed) candidates.push(trimmed);

  // 브랜드 제거
  if (brand && trimmed.includes(brand)) {
    const stripped = trimmed.replace(brand, "").trim();
    if (stripped && stripped !== trimmed) candidates.push(stripped);
  }

  // 괄호/숫자/단위 제거 후 재시도
  const cleaned = trimmed
    .replace(/\([^)]*\)/g, "")
    .replace(/\d+(\.\d+)?\s*(g|kg|ml|l|개|입|봉|팩|병)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned && !candidates.includes(cleaned)) candidates.push(cleaned);

  // 첫 2개 토큰
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const first2 = tokens.slice(0, 2).join(" ");
    if (!candidates.includes(first2)) candidates.push(first2);
  }
  // 첫 1개 토큰
  if (tokens.length >= 1) {
    const first1 = tokens[0];
    if (first1 && first1.length >= 2 && !candidates.includes(first1)) {
      candidates.push(first1);
    }
  }

  // 중복 제거 + 빈 문자열 제거
  return [...new Set(candidates.filter((s) => s.trim().length > 0))];
}

// 공개 API
export async function lookupNutrition(args: {
  productName: string;
  brand?: string;
}): Promise<NutritionLookupResult> {
  const key = loadKey();
  if (!key) return mockResult(args.productName);

  const candidates = buildSearchCandidates(args.productName, args.brand);
  if (candidates.length === 0) return emptyResult();

  // 첫 후보로 lowercase serviceKey 시도. XML/인증 실패면 uppercase로 1회 fallback.
  let useUppercase = false;
  let firstAttempt = await fetchByName(key, candidates[0], false);
  if (firstAttempt && firstAttempt.resultCode === "XML_ERROR") {
    // 401/인증 에러 가능성 — uppercase로 재시도
    useUppercase = true;
    firstAttempt = await fetchByName(key, candidates[0], true);
  }

  if (!firstAttempt) return emptyResult();

  // 검색 후보 순회 — 결과 있으면 즉시 픽
  const tryList: { items: FoodItem[]; query: string }[] = [];
  if (firstAttempt.items.length > 0) {
    tryList.push({ items: firstAttempt.items, query: candidates[0] });
  }
  for (let i = 1; i < candidates.length; i++) {
    if (tryList.length > 0) break; // 이미 결과 있으면 중단
    const r = await fetchByName(key, candidates[i], useUppercase);
    if (r && r.items.length > 0) {
      tryList.push({ items: r.items, query: candidates[i] });
    }
  }

  if (tryList.length === 0) return emptyResult();

  const { items, query } = tryList[0];
  const best = pickBestItem(items, query);
  if (!best) return emptyResult();

  return {
    found: true,
    foodCode: best.FOOD_CD ?? null,
    foodName: best.FOOD_NM_KR ?? null,
    category: best.FOOD_CAT1_NM ?? null,
    servingSize: best.SERVING_SIZE ?? null,
    nutrition: extractNutrition(best),
    source: "datagokr",
  };
}
