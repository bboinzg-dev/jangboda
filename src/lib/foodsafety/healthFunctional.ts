// 식품안전나라 OpenAPI 건강기능식품 어댑터
// - I0760: 건강기능식품 영양카테고리 (585건)
// - I-0050: 건강기능식품 개별인정형 원료 (428건)
//
// 주 1회 sync로 DB 적재. 다른 foodsafety 모듈과 동일한 KOREANNET_API_KEY 사용,
// 독립적으로 진화할 수 있게 self-contained로 작성.

import { readFileSync } from "node:fs";

const BASE = "http://openapi.foodsafetykorea.go.kr/api";

// ---------- I0760: 영양카테고리 ----------
export type HealthCategoryRow = {
  groupCode: string;            // HELT_ITM_GRP_CD (unique)
  groupName: string;            // HELT_ITM_GRP_NM
  largeCategoryCode?: string;   // LCLAS_CD
  largeCategoryName?: string;   // LCLAS_NM
  midCategoryCode?: string;     // MLSFC_CD
  midCategoryName?: string;     // MLSFC_NM
  smallCategoryCode?: string;   // SCLAS_CD
  smallCategoryName?: string;   // SCLAS_NM
};

type RawCategoryRow = {
  HELT_ITM_GRP_CD?: string;
  HELT_ITM_GRP_NM?: string;
  LCLAS_CD?: string;
  LCLAS_NM?: string;
  MLSFC_CD?: string;
  MLSFC_NM?: string;
  SCLAS_CD?: string;
  SCLAS_NM?: string;
};

// ---------- I-0050: 개별인정형 원료 ----------
export type HealthRawMaterialRow = {
  recognitionNo: string;        // HF_FNCLTY_MTRAL_RCOGN_NO (unique)
  rawMaterialName: string;      // RAWMTRL_NM
  weightUnit?: string;          // WT_UNIT
  dailyIntakeMin?: string;      // DAY_INTK_LOWLIMIT
  dailyIntakeMax?: string;      // DAY_INTK_HIGHLIMIT
  primaryFunction?: string;     // PRIMARY_FNCLTY
  warning?: string;             // IFTKN_ATNT_MATR_CN
};

type RawMaterialRow = {
  HF_FNCLTY_MTRAL_RCOGN_NO?: string;
  RAWMTRL_NM?: string;
  WT_UNIT?: string;
  DAY_INTK_LOWLIMIT?: string;
  DAY_INTK_HIGHLIMIT?: string;
  PRIMARY_FNCLTY?: string;
  IFTKN_ATNT_MATR_CN?: string;
};

// .env에서 KOREANNET_API_KEY 읽기 — process.env가 비어 있는 환경 fallback
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

function toCategoryRow(r: RawCategoryRow): HealthCategoryRow | null {
  const groupCode = (r.HELT_ITM_GRP_CD ?? "").trim();
  const groupName = (r.HELT_ITM_GRP_NM ?? "").trim();
  if (!groupCode || !groupName) return null;
  return {
    groupCode,
    groupName,
    largeCategoryCode: r.LCLAS_CD?.trim() || undefined,
    largeCategoryName: r.LCLAS_NM?.trim() || undefined,
    midCategoryCode: r.MLSFC_CD?.trim() || undefined,
    midCategoryName: r.MLSFC_NM?.trim() || undefined,
    smallCategoryCode: r.SCLAS_CD?.trim() || undefined,
    smallCategoryName: r.SCLAS_NM?.trim() || undefined,
  };
}

function toRawMaterialRow(r: RawMaterialRow): HealthRawMaterialRow | null {
  const recognitionNo = (r.HF_FNCLTY_MTRAL_RCOGN_NO ?? "").trim();
  const rawMaterialName = (r.RAWMTRL_NM ?? "").trim();
  if (!recognitionNo || !rawMaterialName) return null;
  return {
    recognitionNo,
    rawMaterialName,
    weightUnit: r.WT_UNIT?.trim() || undefined,
    dailyIntakeMin: r.DAY_INTK_LOWLIMIT?.trim() || undefined,
    dailyIntakeMax: r.DAY_INTK_HIGHLIMIT?.trim() || undefined,
    primaryFunction: r.PRIMARY_FNCLTY?.trim() || undefined,
    warning: r.IFTKN_ATNT_MATR_CN?.trim() || undefined,
  };
}

// I0760 한 페이지 fetch — 키 없을 시 mock 3건 fallback.
export async function fetchHealthCategoryPage(
  startIdx: number,
  endIdx: number
): Promise<{ rows: HealthCategoryRow[]; total: number; error?: string }> {
  const key = loadKey();
  if (!key) {
    const mock: HealthCategoryRow[] = [
      {
        groupCode: "MOCK-CAT-001",
        groupName: "면역기능 개선",
        largeCategoryCode: "01",
        largeCategoryName: "건강기능식품",
        midCategoryCode: "0101",
        midCategoryName: "면역기능",
        smallCategoryCode: "010101",
        smallCategoryName: "면역증진",
      },
      {
        groupCode: "MOCK-CAT-002",
        groupName: "장 건강",
        largeCategoryCode: "01",
        largeCategoryName: "건강기능식품",
        midCategoryCode: "0102",
        midCategoryName: "소화기 건강",
        smallCategoryCode: "010201",
        smallCategoryName: "장내환경개선",
      },
      {
        groupCode: "MOCK-CAT-003",
        groupName: "체지방 감소",
        largeCategoryCode: "01",
        largeCategoryName: "건강기능식품",
        midCategoryCode: "0103",
        midCategoryName: "체지방",
        smallCategoryCode: "010301",
        smallCategoryName: "체지방감소",
      },
    ];
    return {
      rows: mock,
      total: mock.length,
      error: "KOREANNET_API_KEY 미설정 — mock 사용",
    };
  }

  const url = `${BASE}/${key}/I0760/json/${startIdx}/${endIdx}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { rows: [], total: 0, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      I0760?: {
        total_count?: string | number;
        row?: RawCategoryRow[];
        RESULT?: { CODE?: string; MSG?: string };
      };
    };
    const block = json.I0760;
    if (!block) {
      return { rows: [], total: 0, error: "응답 파싱 실패 — I0760 블록 없음" };
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
    const rows = (block.row ?? [])
      .map(toCategoryRow)
      .filter((r): r is HealthCategoryRow => r !== null);
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

// I-0050 한 페이지 fetch — 키 없을 시 mock 3건 fallback.
export async function fetchHealthRawMaterialPage(
  startIdx: number,
  endIdx: number
): Promise<{ rows: HealthRawMaterialRow[]; total: number; error?: string }> {
  const key = loadKey();
  if (!key) {
    const mock: HealthRawMaterialRow[] = [
      {
        recognitionNo: "MOCK-RM-001",
        rawMaterialName: "엘카르니틴타르트레이트",
        weightUnit: "mg",
        dailyIntakeMin: "500",
        dailyIntakeMax: "2000",
        primaryFunction: "운동수행능력 향상에 도움을 줄 수 있음",
        warning: "임산부, 수유부는 섭취를 피해주세요.",
      },
      {
        recognitionNo: "MOCK-RM-002",
        rawMaterialName: "프로바이오틱스",
        weightUnit: "억CFU",
        dailyIntakeMin: "1",
        dailyIntakeMax: "100",
        primaryFunction: "유산균 증식 및 유해균 억제, 배변활동 원활",
        warning: "이상 반응이 나타나면 섭취를 중단하세요.",
      },
      {
        recognitionNo: "MOCK-RM-003",
        rawMaterialName: "오메가-3 지방산",
        weightUnit: "g",
        dailyIntakeMin: "0.5",
        dailyIntakeMax: "2",
        primaryFunction: "혈중 중성지질 개선·혈행 개선에 도움",
        warning: "항응고제 복용자는 의사와 상의 후 섭취하세요.",
      },
    ];
    return {
      rows: mock,
      total: mock.length,
      error: "KOREANNET_API_KEY 미설정 — mock 사용",
    };
  }

  // I-0050은 코드에 하이픈이 있으니 그대로 URL에 사용
  const url = `${BASE}/${key}/I-0050/json/${startIdx}/${endIdx}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { rows: [], total: 0, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      "I-0050"?: {
        total_count?: string | number;
        row?: RawMaterialRow[];
        RESULT?: { CODE?: string; MSG?: string };
      };
    };
    const block = json["I-0050"];
    if (!block) {
      return { rows: [], total: 0, error: "응답 파싱 실패 — I-0050 블록 없음" };
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
    const rows = (block.row ?? [])
      .map(toRawMaterialRow)
      .filter((r): r is HealthRawMaterialRow => r !== null);
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
