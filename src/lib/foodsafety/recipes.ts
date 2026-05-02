// 식품안전나라 OpenAPI COOKRCP01 (조리식품 레시피 DB) 어댑터
//
// 전체 약 1,146건 — 매월 1일 03시 sync로 DB 적재. 1회 실행에 충분히 들어감.
// RCP_SEQ(일련번호)가 unique key.
//
// 다른 foodsafety 모듈과 동일한 KOREANNET_API_KEY 사용. 독립 진화 가능하도록 self-contained.

import { readFileSync } from "node:fs";

const BASE = "http://openapi.foodsafetykorea.go.kr/api";

// MANUAL01..20 / MANUAL_IMG01..20 단계 정보
export type RecipeStep = {
  idx: number;
  text: string;
  image?: string;
};

// Prisma Recipe 모델과 동일한 형태의 정제된 객체
export type RecipeParsed = {
  recipeSeq: string;
  name: string;
  cookingMethod: string | null;
  category: string | null;
  servingWeight: string | null;
  caloriesKcal: number | null;
  carbsG: number | null;
  proteinG: number | null;
  fatG: number | null;
  sodiumMg: number | null;
  hashtags: string | null;
  imageMain: string | null;
  imageBig: string | null;
  ingredientsRaw: string | null;
  ingredientsList: string[];
  steps: RecipeStep[];
  tip: string | null;
};

// COOKRCP01 원본 응답 row 타입 (가변 필드 다수)
export type RecipeRaw = {
  RCP_SEQ?: string;
  RCP_NM?: string;
  RCP_WAY2?: string;
  RCP_PAT2?: string;
  INFO_WGT?: string;
  INFO_ENG?: string;
  INFO_CAR?: string;
  INFO_PRO?: string;
  INFO_FAT?: string;
  INFO_NA?: string;
  HASH_TAG?: string;
  ATT_FILE_NO_MAIN?: string;
  ATT_FILE_NO_MK?: string;
  RCP_PARTS_DTLS?: string;
  RCP_NA_TIP?: string;
  // MANUAL01..20, MANUAL_IMG01..20 — 동적 키
  [key: string]: string | undefined;
};

// .env에서 KOREANNET_API_KEY 읽기 — process.env가 비어 있는 환경(스크립트 등)을 위해 fallback.
function loadKey(): string | null {
  const fromEnv = process.env.KOREANNET_API_KEY ?? process.env.FOODSAFETY_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    const txt = readFileSync(".env", "utf8");
    const m = txt.match(/KOREANNET_API_KEY\s*=\s*"?([^"\n\r]+)"?/);
    if (m) return m[1].trim();
  } catch {
    // .env 없을 수 있음
  }
  return null;
}

// 숫자 파싱 — 빈 문자열/NaN은 null로
function toNumOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// 빈 문자열은 null
function toStrOrNull(v: string | undefined): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// 재료 텍스트(RCP_PARTS_DTLS)에서 토큰 추출
//
// 일반적인 형태:
//   "• 재료\n돼지고기(앞다리살) 200g, 양파 1/2개, 대파 1대\n• 양념\n고추장 2큰술, 간장 1큰술"
//
// 전략:
//   1. 줄 단위로 분리, 각 줄에서 BOM/특수기호 제거
//   2. 섹션 헤더(• 재료, • 양념, [재료] 등) 줄은 헤더 단어 자체는 토큰화 안 함
//      → 헤더 표시는 떼어내고 같은 줄에 본문이 같이 있으면 본문은 사용
//   3. 본문 라인은 콤마/슬래시로 분리
//   4. 각 토큰의 첫 한국어 단어(공백/숫자/괄호 이전)를 재료명으로 추출
//   5. 길이 1자 토큰 제거, 중복 제거
export function parseIngredientsList(raw: string | null | undefined): string[] {
  if (!raw) return [];

  // 헤더로 판단할 키워드 — 단독으로 나오면 토큰 추출 대상에서 제외
  const HEADER_WORDS = new Set([
    "재료", "양념", "주재료", "부재료", "소스", "양념장", "고명",
    "조미료", "토핑", "채소", "재료및분량", "재료분량",
  ]);

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const lineRaw of lines) {
    // 라인 시작의 불릿/대괄호/하이픈 제거
    let line = lineRaw
      .replace(/^[•·●○■□▶▷*\-‣◦◆]+\s*/u, "")
      .replace(/^\[[^\]]+\]\s*/u, "") // [재료] 같은 헤더
      .trim();

    if (!line) continue;

    // "재료:", "재료 :" 같은 라벨 제거 — 콜론까지만
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && colonIdx < 12) {
      const before = line.slice(0, colonIdx).replace(/\s/g, "");
      if (HEADER_WORDS.has(before) || /^[가-힣]+$/.test(before)) {
        line = line.slice(colonIdx + 1).trim();
      }
    }

    if (!line) continue;

    // 섹션 헤더만 있는 라인이면 skip
    const compact = line.replace(/\s/g, "");
    if (HEADER_WORDS.has(compact)) continue;

    // 콤마/슬래시/세미콜론으로 분리 — 한 줄에 여러 재료가 있는 케이스
    const parts = line.split(/[,，/、;]/u).map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      // 토큰의 첫 한국어/영문 단어 추출 (공백/숫자/괄호/단위 이전까지)
      // 첫 시작이 한글 또는 영문이어야 함
      const m = part.match(/^([가-힣A-Za-z]+(?:\([^)]*\))?)/u);
      if (!m) continue;
      // 괄호 안 내용은 일단 떼고 본명만 사용
      let token = m[1].replace(/\([^)]*\)/g, "").trim();
      if (!token) continue;
      if (token.length < 2) continue; // 한 글자 단어 제외 — "물" 같은 것도 빠지지만 신호 약함
      if (HEADER_WORDS.has(token)) continue;

      const key = token;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(token);
    }
  }

  return out;
}

// MANUAL01..20 + MANUAL_IMG01..20 → RecipeStep[]
export function parseSteps(raw: RecipeRaw): RecipeStep[] {
  const steps: RecipeStep[] = [];
  for (let i = 1; i <= 20; i++) {
    const k = String(i).padStart(2, "0");
    const text = (raw[`MANUAL${k}`] ?? "").trim();
    const image = (raw[`MANUAL_IMG${k}`] ?? "").trim();
    if (!text && !image) continue;
    if (!text) continue; // 텍스트 없으면 의미 없음
    steps.push({
      idx: i,
      text,
      image: image || undefined,
    });
  }
  return steps;
}

// 단일 raw row → 정제된 RecipeParsed (recipeSeq/name 없으면 null)
export function parseRecipeRow(raw: RecipeRaw): RecipeParsed | null {
  const recipeSeq = (raw.RCP_SEQ ?? "").trim();
  const name = (raw.RCP_NM ?? "").trim();
  if (!recipeSeq || !name) return null;

  const ingredientsRaw = toStrOrNull(raw.RCP_PARTS_DTLS);
  const ingredientsList = parseIngredientsList(ingredientsRaw);
  const steps = parseSteps(raw);

  return {
    recipeSeq,
    name,
    cookingMethod: toStrOrNull(raw.RCP_WAY2),
    category: toStrOrNull(raw.RCP_PAT2),
    servingWeight: toStrOrNull(raw.INFO_WGT),
    caloriesKcal: toNumOrNull(raw.INFO_ENG),
    carbsG: toNumOrNull(raw.INFO_CAR),
    proteinG: toNumOrNull(raw.INFO_PRO),
    fatG: toNumOrNull(raw.INFO_FAT),
    sodiumMg: toNumOrNull(raw.INFO_NA),
    hashtags: toStrOrNull(raw.HASH_TAG),
    imageMain: toStrOrNull(raw.ATT_FILE_NO_MAIN),
    imageBig: toStrOrNull(raw.ATT_FILE_NO_MK),
    ingredientsRaw,
    ingredientsList,
    steps,
    tip: toStrOrNull(raw.RCP_NA_TIP),
  };
}

// COOKRCP01 한 페이지 fetch
// 실패 또는 키 없을 시 mock 2건 (개발 환경 fallback).
export async function fetchRecipesPage(
  startIdx: number,
  endIdx: number
): Promise<{ rows: RecipeRaw[]; total: number; error?: string }> {
  const key = loadKey();
  if (!key) {
    const mock: RecipeRaw[] = [
      {
        RCP_SEQ: "MOCK-1",
        RCP_NM: "닭갈비",
        RCP_WAY2: "굽기",
        RCP_PAT2: "일품",
        INFO_WGT: "300",
        INFO_ENG: "420.5",
        INFO_CAR: "30.0",
        INFO_PRO: "28.0",
        INFO_FAT: "18.5",
        INFO_NA: "850.0",
        HASH_TAG: "닭갈비#매콤한맛",
        ATT_FILE_NO_MAIN: "",
        ATT_FILE_NO_MK: "",
        RCP_PARTS_DTLS:
          "• 재료\n닭다리살 400g, 양배추 200g, 양파 1개, 고구마 1개, 떡 100g\n• 양념\n고추장 3큰술, 고춧가루 2큰술, 간장 1큰술, 다진마늘 1큰술",
        MANUAL01: "1. 닭다리살을 한입 크기로 자른다.",
        MANUAL_IMG01: "",
        MANUAL02: "2. 양념을 모두 섞어 닭에 재워둔다.",
        MANUAL03: "3. 채소를 큼직하게 썬다.",
        MANUAL04: "4. 팬에 닭과 채소를 함께 볶는다.",
        RCP_NA_TIP: "기름을 적게 사용하면 칼로리를 줄일 수 있어요.",
      },
      {
        RCP_SEQ: "MOCK-2",
        RCP_NM: "된장찌개",
        RCP_WAY2: "끓이기",
        RCP_PAT2: "국&찌개",
        INFO_WGT: "350",
        INFO_ENG: "180.0",
        INFO_CAR: "12.0",
        INFO_PRO: "14.0",
        INFO_FAT: "8.0",
        INFO_NA: "950.0",
        HASH_TAG: "된장찌개#한식기본",
        ATT_FILE_NO_MAIN: "",
        ATT_FILE_NO_MK: "",
        RCP_PARTS_DTLS:
          "• 재료\n두부 1/2모, 애호박 1/4개, 양파 1/2개, 감자 1개, 대파 1대, 청양고추 1개\n• 양념\n된장 2큰술, 다진마늘 1큰술",
        MANUAL01: "1. 채소를 한입 크기로 썬다.",
        MANUAL02: "2. 냄비에 물과 된장을 풀어 끓인다.",
        MANUAL03: "3. 감자, 양파를 먼저 넣고 끓인다.",
        MANUAL04: "4. 두부와 애호박, 대파를 넣고 마저 끓인다.",
        RCP_NA_TIP: "된장의 양을 줄이면 나트륨을 낮출 수 있습니다.",
      },
    ];
    return {
      rows: mock,
      total: mock.length,
      error: "KOREANNET_API_KEY 미설정 — mock 사용",
    };
  }

  const url = `${BASE}/${key}/COOKRCP01/json/${startIdx}/${endIdx}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { rows: [], total: 0, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      COOKRCP01?: {
        total_count?: string | number;
        row?: RecipeRaw[];
        RESULT?: { CODE?: string; MSG?: string };
      };
    };
    const block = json.COOKRCP01;
    if (!block) {
      return { rows: [], total: 0, error: "응답 파싱 실패 — COOKRCP01 블록 없음" };
    }
    const code = block.RESULT?.CODE;
    if (code && code !== "INFO-000") {
      return {
        rows: [],
        total:
          typeof block.total_count === "string"
            ? parseInt(block.total_count) || 0
            : block.total_count ?? 0,
        error: `${code} ${block.RESULT?.MSG ?? ""}`.trim(),
      };
    }
    const rows = block.row ?? [];
    const total =
      typeof block.total_count === "string"
        ? parseInt(block.total_count) || 0
        : block.total_count ?? 0;
    return { rows, total };
  } catch (e) {
    return {
      rows: [],
      total: 0,
      error: `fetch 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
