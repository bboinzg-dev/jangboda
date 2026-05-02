// 식품안전나라 OpenAPI 수산물이력 어댑터 — on-demand lookup (DB 미저장)
//
// I1920 — 수산물이력정보-기본정보 (1건)
// I1930 — 수산물이력정보-생산정보 (N건, 입고일자 asc 정렬)
// I1940 — 수산물이력정보-출하정보 (N건, 출고일자 asc 정렬)
//
// 사용자가 입력한 HIST_TRACE_REG_NO를 path filter로 3개 엔드포인트에 병렬 호출.
// Food Safety Korea API는 미문서화 필드도 path filter로 대체로 허용.
// 응답 받은 후 한 번 더 클라이언트단 필터(case-insensitive)로 안전성 확보.

import { readFileSync } from "node:fs";

const BASE = "http://openapi.foodsafetykorea.go.kr/api";

// ──────────────── Public types ────────────────

export type SeafoodBasic = {
  histTraceRegNo: string; // HIST_TRACE_REG_NO
  goodsName: string; // GOODS_NM (상품명)
  prdlstGroupName: string; // PRDLST_GROUP_DVS_NM (품목)
  enterpriseName: string; // ENTRPS_NM (업소명)
  telNo: string; // TELNO
  address: string; // ADDR
};

export type SeafoodProduction = {
  histTraceRegNo: string; // HIST_TRACE_REG_NO
  lotNoWarehousing: string; // LOTNO_WRHOUSNG (입고로트)
  goodsName: string; // GOODS_NM
  prdlstGroupName: string; // PRDLST_GROUP_DVS_NM
  settQty: string; // SETT_QTY (입식수량)
  warehousingDate: string; // WRHOUSNG_DT (입고일자, YYYYMMDD)
  warehousingQty: string; // WRHOUSNG_QTY (입고수량)
  warehousingUnit: string; // PHHGH_UNIT_CD_NM (입고단위)
};

export type SeafoodRelease = {
  histTraceRegNo: string; // HIST_TRACE_REG_NO
  lotNoRelease: string; // LOTNO_RELES (출고로트)
  lotNoWarehousing: string; // LOTNO_WRHOUSNG (입고로트)
  prdlstGroupName: string; // PRDLST_GROUP_DVS_NM
  releaseDvsName: string; // RELES_DVS_NM (출고구분)
  productionDate: string; // PRDCTN_DT (생산일자, YYYYMMDD)
  productionQty: string; // PRDCTN_QTY (생산수량)
  releaseDate: string; // RELES_DT (출고일자, YYYYMMDD)
  releaseQty: string; // RELES_QTY (출고수량)
  releaseUnit: string; // RELES_UNIT_NM (출고단위)
};

export type SeafoodTraceResult = {
  found: boolean;
  regNo: string;
  basic: SeafoodBasic | null;
  productions: SeafoodProduction[];
  releases: SeafoodRelease[];
  source: "foodsafety" | "mock" | "none";
  error?: string;
};

// ──────────────── Internal helpers ────────────────

// .env에서 KOREANNET_API_KEY 읽기 — process.env가 비어 있는 환경(스크립트 등) 대비 fallback.
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

// 이력추적등록번호 형식: 영숫자 10~15자 (식약처 통상 길이)
function isValidRegNo(regNo: string): boolean {
  if (!regNo) return false;
  const trimmed = regNo.trim();
  if (trimmed.length < 8 || trimmed.length > 20) return false;
  return /^[A-Za-z0-9]+$/.test(trimmed);
}

function buildUrl(
  key: string,
  code: string,
  filters: Record<string, string>
): string {
  const parts = Object.entries(filters)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}=${encodeURIComponent(v.trim())}`);
  const filterPath = parts.length > 0 ? `/${parts.join("&")}` : "";
  return `${BASE}/${key}/${code}/json/1/100${filterPath}`;
}

type FoodSafetyEnvelope<T> = {
  [code: string]:
    | {
        total_count?: string;
        row?: T[];
        RESULT?: { CODE?: string; MSG?: string };
      }
    | undefined;
};

async function fetchRows<T>(
  key: string,
  code: string,
  filters: Record<string, string>
): Promise<T[]> {
  try {
    const url = buildUrl(key, code, filters);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as FoodSafetyEnvelope<T>;
    const envelope = json[code];
    const resultCode = envelope?.RESULT?.CODE;
    // INFO-000 = 성공, INFO-200 = 결과 없음(에러 아님), 그 외는 빈 배열
    if (resultCode && resultCode !== "INFO-000") return [];
    return envelope?.row ?? [];
  } catch (e) {
    console.warn(`[foodsafety/seafood/${code}] fetch 실패:`, e);
    return [];
  }
}

// ──────────────── Row → camelCase 변환 ────────────────

type I1920Row = {
  HIST_TRACE_REG_NO?: string;
  GOODS_NM?: string;
  PRDLST_GROUP_DVS_NM?: string;
  ENTRPS_NM?: string;
  TELNO?: string;
  ADDR?: string;
};

type I1930Row = {
  HIST_TRACE_REG_NO?: string;
  LOTNO_WRHOUSNG?: string;
  GOODS_NM?: string;
  PRDLST_GROUP_DVS_NM?: string;
  SETT_QTY?: string;
  WRHOUSNG_DT?: string;
  WRHOUSNG_QTY?: string;
  PHHGH_UNIT_CD_NM?: string;
};

type I1940Row = {
  HIST_TRACE_REG_NO?: string;
  LOTNO_RELES?: string;
  LOTNO_WRHOUSNG?: string;
  PRDLST_GROUP_DVS_NM?: string;
  RELES_DVS_NM?: string;
  PRDCTN_DT?: string;
  PRDCTN_QTY?: string;
  RELES_DT?: string;
  RELES_QTY?: string;
  RELES_UNIT_NM?: string;
};

function toBasic(r: I1920Row): SeafoodBasic {
  return {
    histTraceRegNo: r.HIST_TRACE_REG_NO ?? "",
    goodsName: r.GOODS_NM ?? "",
    prdlstGroupName: r.PRDLST_GROUP_DVS_NM ?? "",
    enterpriseName: r.ENTRPS_NM ?? "",
    telNo: r.TELNO ?? "",
    address: r.ADDR ?? "",
  };
}

function toProduction(r: I1930Row): SeafoodProduction {
  return {
    histTraceRegNo: r.HIST_TRACE_REG_NO ?? "",
    lotNoWarehousing: r.LOTNO_WRHOUSNG ?? "",
    goodsName: r.GOODS_NM ?? "",
    prdlstGroupName: r.PRDLST_GROUP_DVS_NM ?? "",
    settQty: r.SETT_QTY ?? "",
    warehousingDate: r.WRHOUSNG_DT ?? "",
    warehousingQty: r.WRHOUSNG_QTY ?? "",
    warehousingUnit: r.PHHGH_UNIT_CD_NM ?? "",
  };
}

function toRelease(r: I1940Row): SeafoodRelease {
  return {
    histTraceRegNo: r.HIST_TRACE_REG_NO ?? "",
    lotNoRelease: r.LOTNO_RELES ?? "",
    lotNoWarehousing: r.LOTNO_WRHOUSNG ?? "",
    prdlstGroupName: r.PRDLST_GROUP_DVS_NM ?? "",
    releaseDvsName: r.RELES_DVS_NM ?? "",
    productionDate: r.PRDCTN_DT ?? "",
    productionQty: r.PRDCTN_QTY ?? "",
    releaseDate: r.RELES_DT ?? "",
    releaseQty: r.RELES_QTY ?? "",
    releaseUnit: r.RELES_UNIT_NM ?? "",
  };
}

// ──────────────── Mock fallback (API 키 없을 때) ────────────────

function mockResult(regNo: string): SeafoodTraceResult {
  return {
    found: true,
    regNo,
    basic: {
      histTraceRegNo: regNo,
      goodsName: "샘플 활광어",
      prdlstGroupName: "넙치",
      enterpriseName: "샘플 양식장",
      telNo: "064-000-0000",
      address: "제주특별자치도 제주시 샘플로 1",
    },
    productions: [
      {
        histTraceRegNo: regNo,
        lotNoWarehousing: "L20240101",
        goodsName: "샘플 활광어",
        prdlstGroupName: "넙치",
        settQty: "10000",
        warehousingDate: "20240101",
        warehousingQty: "10000",
        warehousingUnit: "마리",
      },
    ],
    releases: [
      {
        histTraceRegNo: regNo,
        lotNoRelease: "R20240501",
        lotNoWarehousing: "L20240101",
        prdlstGroupName: "넙치",
        releaseDvsName: "도매",
        productionDate: "20240430",
        productionQty: "500",
        releaseDate: "20240501",
        releaseQty: "500",
        releaseUnit: "kg",
      },
    ],
    source: "mock",
  };
}

// ──────────────── Public API ────────────────

export async function lookupSeafoodTrace(
  regNo: string
): Promise<SeafoodTraceResult> {
  const trimmed = (regNo ?? "").trim();

  if (!isValidRegNo(trimmed)) {
    return {
      found: false,
      regNo: trimmed,
      basic: null,
      productions: [],
      releases: [],
      source: "none",
      error: "이력추적등록번호 형식이 올바르지 않습니다",
    };
  }

  const key = loadKey();
  if (!key) return mockResult(trimmed);

  try {
    // 3개 엔드포인트 병렬 호출 — HIST_TRACE_REG_NO를 path filter로 사용.
    const filter = { HIST_TRACE_REG_NO: trimmed };
    const [basicRowsRaw, prodRowsRaw, releaseRowsRaw] = await Promise.all([
      fetchRows<I1920Row>(key, "I1920", filter),
      fetchRows<I1930Row>(key, "I1930", filter),
      fetchRows<I1940Row>(key, "I1940", filter),
    ]);

    // 응답 후 case-insensitive 클라이언트단 필터 (path filter가 무시될 수 있음 대비)
    const lower = trimmed.toLowerCase();
    const basicRows = basicRowsRaw.filter(
      (r) => (r.HIST_TRACE_REG_NO ?? "").toLowerCase() === lower
    );
    const prodRows = prodRowsRaw.filter(
      (r) => (r.HIST_TRACE_REG_NO ?? "").toLowerCase() === lower
    );
    const releaseRows = releaseRowsRaw.filter(
      (r) => (r.HIST_TRACE_REG_NO ?? "").toLowerCase() === lower
    );

    const basic = basicRows.length > 0 ? toBasic(basicRows[0]) : null;

    const productions = prodRows
      .map(toProduction)
      // 입고일자 오름차순
      .sort((a, b) => a.warehousingDate.localeCompare(b.warehousingDate));

    const releases = releaseRows
      .map(toRelease)
      // 출고일자 오름차순
      .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

    const found = basic !== null || productions.length > 0 || releases.length > 0;

    return {
      found,
      regNo: trimmed,
      basic,
      productions,
      releases,
      source: found ? "foodsafety" : "none",
    };
  } catch (e) {
    return {
      found: false,
      regNo: trimmed,
      basic: null,
      productions: [],
      releases: [],
      source: "none",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
