// 식품안전나라 OpenAPI C002 (식품 품목제조보고 원재료) 어댑터
//
// 전체 1,049,957건이라 DB 적재 불가 → 제품 상세 페이지에서 on-demand lookup.
// 한 제품이 N개 행(원재료별 1행)으로 쪼개져 있어 (BSSH_NM, PRDLST_NM)으로 그룹화 후
// RAWMTRL_ORDNO 오름차순 정렬해 합치는 방식.
//
// 주의: foodsafety.ts와 동일한 KOREANNET_API_KEY를 쓰지만, 각자 독립적으로 진화할 수
// 있도록 self-contained로 작성. (loadKey 로컬 정의)

import { readFileSync } from "node:fs";

const BASE = "http://openapi.foodsafetykorea.go.kr/api";

export type IngredientRow = {
  rawMaterialName: string; // RAWMTRL_NM
  order: number; // RAWMTRL_ORDNO (정수, 실패 시 999)
  productName: string; // PRDLST_NM
  manufacturer: string; // BSSH_NM
  reportNo: string; // PRDLST_REPORT_NO
  productType: string | null; // PRDLST_DCNM
};

export type IngredientLookupResult = {
  found: boolean;
  productName: string | null;
  manufacturer: string | null;
  reportNo: string | null;
  productType: string | null;
  ingredients: IngredientRow[];
  raw: string; // 콤마+공백 결합한 표시용 문자열
  source: "foodsafety_c002" | "mock" | "none";
};

type C002Row = {
  LCNS_NO?: string;
  BSSH_NM?: string;
  PRDLST_REPORT_NO?: string;
  PRMS_DT?: string;
  PRDLST_NM?: string;
  PRDLST_DCNM?: string;
  RAWMTRL_NM?: string;
  RAWMTRL_ORDNO?: string;
  CHNG_DT?: string;
  ETQTY_XPORT_PRDLST_YN?: string;
};

type C002Response = {
  C002?: {
    total_count?: string;
    row?: C002Row[];
    RESULT?: { CODE?: string; MSG?: string };
  };
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

function emptyResult(): IngredientLookupResult {
  return {
    found: false,
    productName: null,
    manufacturer: null,
    reportNo: null,
    productType: null,
    ingredients: [],
    raw: "",
    source: "none",
  };
}

// 개발용 mock — API 키 없을 때
function mockResult(productName?: string, manufacturer?: string): IngredientLookupResult {
  const ingredients: IngredientRow[] = [
    { rawMaterialName: "정제수", order: 1, productName: productName ?? "샘플 제품", manufacturer: manufacturer ?? "샘플 제조사", reportNo: "00000000000000", productType: "기타가공품" },
    { rawMaterialName: "밀가루(밀:미국산)", order: 2, productName: productName ?? "샘플 제품", manufacturer: manufacturer ?? "샘플 제조사", reportNo: "00000000000000", productType: "기타가공품" },
    { rawMaterialName: "정제소금", order: 3, productName: productName ?? "샘플 제품", manufacturer: manufacturer ?? "샘플 제조사", reportNo: "00000000000000", productType: "기타가공품" },
    { rawMaterialName: "대두유", order: 4, productName: productName ?? "샘플 제품", manufacturer: manufacturer ?? "샘플 제조사", reportNo: "00000000000000", productType: "기타가공품" },
  ];
  return {
    found: true,
    productName: productName ?? "샘플 제품",
    manufacturer: manufacturer ?? "샘플 제조사",
    reportNo: "00000000000000",
    productType: "기타가공품",
    ingredients,
    raw: ingredients.map((i) => i.rawMaterialName).join(", "),
    source: "mock",
  };
}

// C002 URL 만들기. filters는 path에 `&`로 연결되는 식약처 특수 규칙.
function buildUrl(key: string, filters: Record<string, string>): string {
  const parts = Object.entries(filters)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}=${encodeURIComponent(v.trim())}`);
  const filterPath = parts.length > 0 ? `/${parts.join("&")}` : "";
  return `${BASE}/${key}/C002/json/1/100${filterPath}`;
}

async function fetchC002(
  key: string,
  filters: Record<string, string>
): Promise<{ rows: C002Row[]; totalCount: number } | null> {
  try {
    const url = buildUrl(key, filters);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as C002Response;
    const code = json.C002?.RESULT?.CODE;
    // INFO-000 = 성공, INFO-200 = 결과 없음(에러 아님)
    if (code && code !== "INFO-000") return { rows: [], totalCount: 0 };
    const rows = json.C002?.row ?? [];
    const totalCount = parseInt(json.C002?.total_count ?? "0", 10) || 0;
    return { rows, totalCount };
  } catch (e) {
    console.warn("[foodsafety/c002] fetch 실패:", e);
    return null;
  }
}

function rowToIngredient(r: C002Row): IngredientRow {
  const ord = parseInt(r.RAWMTRL_ORDNO ?? "", 10);
  return {
    rawMaterialName: (r.RAWMTRL_NM ?? "").trim(),
    order: Number.isFinite(ord) ? ord : 999,
    productName: r.PRDLST_NM ?? "",
    manufacturer: r.BSSH_NM ?? "",
    reportNo: r.PRDLST_REPORT_NO ?? "",
    productType: r.PRDLST_DCNM ?? null,
  };
}

// (BSSH_NM, PRDLST_NM)로 그룹화 후 가장 행 수 많은 그룹 선택.
// 동률이면 reportNo 일치 우선, 그래도 동률이면 첫 그룹.
function pickBestGroup(
  rows: C002Row[],
  preferredReportNo?: string
): IngredientRow[] {
  const groups = new Map<string, IngredientRow[]>();
  for (const r of rows) {
    const key = `${r.BSSH_NM ?? ""}||${r.PRDLST_NM ?? ""}`;
    const arr = groups.get(key) ?? [];
    arr.push(rowToIngredient(r));
    groups.set(key, arr);
  }
  if (groups.size === 0) return [];

  const sorted = [...groups.values()].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    if (preferredReportNo) {
      const aMatch = a.some((x) => x.reportNo === preferredReportNo) ? 1 : 0;
      const bMatch = b.some((x) => x.reportNo === preferredReportNo) ? 1 : 0;
      if (bMatch !== aMatch) return bMatch - aMatch;
    }
    return 0;
  });
  return sorted[0];
}

function buildResult(
  ingredients: IngredientRow[],
  source: "foodsafety_c002"
): IngredientLookupResult {
  const sorted = [...ingredients].sort((a, b) => a.order - b.order);
  const head = sorted[0];
  return {
    found: true,
    productName: head?.productName ?? null,
    manufacturer: head?.manufacturer ?? null,
    reportNo: head?.reportNo ?? null,
    productType: head?.productType ?? null,
    ingredients: sorted,
    raw: sorted.map((i) => i.rawMaterialName).filter(Boolean).join(", "),
    source,
  };
}

// 공개 API: 정확도 높은 필터부터 시도하고 fallback.
export async function lookupIngredients(args: {
  productName?: string;
  manufacturer?: string;
  reportNo?: string;
}): Promise<IngredientLookupResult> {
  const key = loadKey();
  if (!key) return mockResult(args.productName, args.manufacturer);

  const productName = args.productName?.trim();
  const manufacturer = args.manufacturer?.trim();
  const reportNo = args.reportNo?.trim();

  // 1) reportNo 단독 — 가장 정확
  if (reportNo) {
    const res = await fetchC002(key, { PRDLST_REPORT_NO: reportNo });
    if (res && res.rows.length > 0) {
      const group = pickBestGroup(res.rows, reportNo);
      // 단일 원재료(1건) 제품 허용 조건: API total_count == 1
      if (group.length >= 2 || (group.length === 1 && res.totalCount === 1)) {
        return buildResult(group, "foodsafety_c002");
      }
    }
  }

  // 2) manufacturer + productName
  if (manufacturer && productName) {
    const res = await fetchC002(key, {
      BSSH_NM: manufacturer,
      PRDLST_NM: productName,
    });
    if (res && res.rows.length > 0) {
      const group = pickBestGroup(res.rows, reportNo);
      if (group.length >= 2 || (group.length === 1 && res.totalCount === 1)) {
        return buildResult(group, "foodsafety_c002");
      }
    }
  }

  // 3) productName 단독
  if (productName) {
    const res = await fetchC002(key, { PRDLST_NM: productName });
    if (res && res.rows.length > 0) {
      const group = pickBestGroup(res.rows, reportNo);
      if (group.length >= 2 || (group.length === 1 && res.totalCount === 1)) {
        return buildResult(group, "foodsafety_c002");
      }
    }
  }

  return emptyResult();
}
