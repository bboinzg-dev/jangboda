// 식품안전나라 OpenAPI 농산물이력추적 어댑터
//
// I1790 — 농산물이력추적 정보 (약 6,424건). HIST_TRACE_REG_NO가 unique key.
// I1800 — 농산물이력추적 유통정보 (약 522건). 거래처 정보를 I1790과 HIST_TRACE_REG_NO로 join.
//
// 다른 foodsafety 모듈과 동일한 KOREANNET_API_KEY를 쓰지만,
// 독립적으로 진화할 수 있게 self-contained로 작성 (haccp.ts 패턴 미러).

import { readFileSync } from "node:fs";

const BASE = "http://openapi.foodsafetykorea.go.kr/api";

export type AgriTraceRow = {
  histTraceRegNo: string;     // HIST_TRACE_REG_NO (unique)
  regInstName?: string;       // REG_INSTT_NM
  rprsntPrdltName: string;    // RPRSNT_PRDLST_NM (대표품목)
  presidentName?: string;     // PRSDNT_NM
  orgnName?: string;          // ORGN_NM (단체/농가명)
  validBeginDate?: string;    // VALD_PRICE_BGN_DT
  validEndDate?: string;      // VALD_PRICE_END_DT
};

export type AgriDistributionRow = {
  histTraceRegNo: string;     // HIST_TRACE_REG_NO (조인 키)
  grpName: string;            // GRP_NM (거래처명)
  presidentName?: string;     // PRSDNT_NM
  telno?: string;             // TELNO
};

type RawAgriTraceRow = {
  HIST_TRACE_REG_NO?: string;
  REG_INSTT_NM?: string;
  RPRSNT_PRDLST_NM?: string;
  PRSDNT_NM?: string;
  ORGN_NM?: string;
  VALD_PRICE_BGN_DT?: string;
  VALD_PRICE_END_DT?: string;
};

type RawAgriDistRow = {
  HIST_TRACE_REG_NO?: string;
  GRP_NM?: string;
  PRSDNT_NM?: string;
  TELNO?: string;
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

function toAgriTraceRow(r: RawAgriTraceRow): AgriTraceRow | null {
  const histTraceRegNo = (r.HIST_TRACE_REG_NO ?? "").trim();
  const rprsntPrdltName = (r.RPRSNT_PRDLST_NM ?? "").trim();
  if (!histTraceRegNo || !rprsntPrdltName) return null;
  return {
    histTraceRegNo,
    rprsntPrdltName,
    regInstName: r.REG_INSTT_NM?.trim() || undefined,
    presidentName: r.PRSDNT_NM?.trim() || undefined,
    orgnName: r.ORGN_NM?.trim() || undefined,
    validBeginDate: r.VALD_PRICE_BGN_DT?.trim() || undefined,
    validEndDate: r.VALD_PRICE_END_DT?.trim() || undefined,
  };
}

function toAgriDistributionRow(r: RawAgriDistRow): AgriDistributionRow | null {
  const histTraceRegNo = (r.HIST_TRACE_REG_NO ?? "").trim();
  const grpName = (r.GRP_NM ?? "").trim();
  if (!histTraceRegNo || !grpName) return null;
  return {
    histTraceRegNo,
    grpName,
    presidentName: r.PRSDNT_NM?.trim() || undefined,
    telno: r.TELNO?.trim() || undefined,
  };
}

// I1790 한 페이지 fetch — 농산물이력추적 기본 정보
// 실패 또는 키 없을 시 mock 3건 (개발 환경 fallback).
export async function fetchAgriTracePage(
  startIdx: number,
  endIdx: number
): Promise<{ rows: AgriTraceRow[]; total: number; error?: string }> {
  const key = loadKey();
  if (!key) {
    const mock: AgriTraceRow[] = [
      {
        histTraceRegNo: "MOCK-AGRI-001",
        rprsntPrdltName: "사과",
        regInstName: "국립농산물품질관리원",
        presidentName: "홍길동",
        orgnName: "청송사과영농조합",
        validBeginDate: "2024-01-01",
        validEndDate: "2026-12-31",
      },
      {
        histTraceRegNo: "MOCK-AGRI-002",
        rprsntPrdltName: "배추",
        regInstName: "국립농산물품질관리원",
        presidentName: "김영희",
        orgnName: "강원도배추농가",
        validBeginDate: "2024-03-01",
        validEndDate: "2027-02-28",
      },
      {
        histTraceRegNo: "MOCK-AGRI-003",
        rprsntPrdltName: "쌀",
        regInstName: "국립농산물품질관리원",
        presidentName: "박철수",
        orgnName: "이천쌀협동조합",
        validBeginDate: "2023-09-01",
        validEndDate: "2026-08-31",
      },
    ];
    return { rows: mock, total: mock.length, error: "KOREANNET_API_KEY 미설정 — mock 사용" };
  }

  const url = `${BASE}/${key}/I1790/json/${startIdx}/${endIdx}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { rows: [], total: 0, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      I1790?: {
        total_count?: string | number;
        row?: RawAgriTraceRow[];
        RESULT?: { CODE?: string; MSG?: string };
      };
    };
    const block = json.I1790;
    if (!block) {
      return { rows: [], total: 0, error: "응답 파싱 실패 — I1790 블록 없음" };
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
      .map(toAgriTraceRow)
      .filter((r): r is AgriTraceRow => r !== null);
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

// I1800 한 페이지 fetch — 농산물이력추적 유통(거래처) 정보
// 실패 또는 키 없을 시 mock 2건 (개발 환경 fallback).
export async function fetchAgriDistributionPage(
  startIdx: number,
  endIdx: number
): Promise<{ rows: AgriDistributionRow[]; total: number; error?: string }> {
  const key = loadKey();
  if (!key) {
    const mock: AgriDistributionRow[] = [
      {
        histTraceRegNo: "MOCK-AGRI-001",
        grpName: "마트유통(주)",
        presidentName: "이순신",
        telno: "02-1234-5678",
      },
      {
        histTraceRegNo: "MOCK-AGRI-002",
        grpName: "신선식품마트",
        presidentName: "최영",
        telno: "031-9876-5432",
      },
    ];
    return { rows: mock, total: mock.length, error: "KOREANNET_API_KEY 미설정 — mock 사용" };
  }

  const url = `${BASE}/${key}/I1800/json/${startIdx}/${endIdx}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { rows: [], total: 0, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      I1800?: {
        total_count?: string | number;
        row?: RawAgriDistRow[];
        RESULT?: { CODE?: string; MSG?: string };
      };
    };
    const block = json.I1800;
    if (!block) {
      return { rows: [], total: 0, error: "응답 파싱 실패 — I1800 블록 없음" };
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
      .map(toAgriDistributionRow)
      .filter((r): r is AgriDistributionRow => r !== null);
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
