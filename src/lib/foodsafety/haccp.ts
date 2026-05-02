// 식품안전나라 OpenAPI I0580 (HACCP 적용업소 지정 현황) 어댑터
//
// 전체 약 38,952건 — 매주 일요일 04시 sync로 DB 적재.
// LCNS_NO(인허가번호)가 unique key. Product.manufacturer ↔ HaccpFacility.bsshNameNorm 매칭.
//
// 다른 foodsafety 모듈(ingredients.ts, ../foodsafety.ts)과 동일한 KOREANNET_API_KEY를 쓰지만,
// 독립적으로 진화할 수 있게 self-contained로 작성.

import { readFileSync } from "node:fs";

const BASE = "http://openapi.foodsafetykorea.go.kr/api";

export type HaccpRow = {
  licenseNo: string;        // LCNS_NO (unique)
  bsshName: string;         // BSSH_NM
  industryName?: string;    // INDUTY_CD_NM
  presidentName?: string;   // PRSDNT_NM
  address?: string;         // SITE_ADDR
  appnDate?: string;        // HACCP_APPN_DT
  appnNo?: string;          // HACCP_APPN_NO
  productListName?: string; // PRDLST_NM
  bizStatus?: string;       // CLSBIZ_DVS_CD_NM ("영업중", "폐업" 등)
  bizCloseDate?: string;    // CLSBIZ_DT
};

type RawRow = {
  LCNS_NO?: string;
  BSSH_NM?: string;
  INDUTY_CD_NM?: string;
  PRSDNT_NM?: string;
  SITE_ADDR?: string;
  HACCP_APPN_DT?: string;
  HACCP_APPN_NO?: string;
  PRDLST_NM?: string;
  CLSBIZ_DVS_CD_NM?: string;
  CLSBIZ_DT?: string;
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

function toRow(r: RawRow): HaccpRow | null {
  const licenseNo = (r.LCNS_NO ?? "").trim();
  const bsshName = (r.BSSH_NM ?? "").trim();
  if (!licenseNo || !bsshName) return null;
  return {
    licenseNo,
    bsshName,
    industryName: r.INDUTY_CD_NM?.trim() || undefined,
    presidentName: r.PRSDNT_NM?.trim() || undefined,
    address: r.SITE_ADDR?.trim() || undefined,
    appnDate: r.HACCP_APPN_DT?.trim() || undefined,
    appnNo: r.HACCP_APPN_NO?.trim() || undefined,
    productListName: r.PRDLST_NM?.trim() || undefined,
    bizStatus: r.CLSBIZ_DVS_CD_NM?.trim() || undefined,
    bizCloseDate: r.CLSBIZ_DT?.trim() || undefined,
  };
}

// 업소명 정규화 — 매칭용
// trim, lowercase, (주)/주식회사/(유)/유한회사 등 법인 표기 제거,
// 모든 공백 제거, 한글/영숫자 외 모두 제거
export function normalizeBsshName(name: string): string {
  if (!name) return "";
  let s = name.trim().toLowerCase();
  // 법인 표기 제거 (다양한 변형)
  s = s.replace(/\(주\)/g, "");
  s = s.replace(/\(유\)/g, "");
  s = s.replace(/\(재\)/g, "");
  s = s.replace(/\(사\)/g, "");
  s = s.replace(/㈜/g, "");
  s = s.replace(/㈜/g, "");
  s = s.replace(/주식회사/g, "");
  s = s.replace(/유한회사/g, "");
  s = s.replace(/유한책임회사/g, "");
  s = s.replace(/주\)/g, "");
  s = s.replace(/\(주/g, "");
  // 공백 제거
  s = s.replace(/\s+/g, "");
  // 한글, 영문 소문자, 숫자만 남기기
  s = s.replace(/[^가-힣a-z0-9]/g, "");
  return s;
}

// I0580 한 페이지 fetch (1 ~ 1000 권장 페이지 크기)
// 실패 또는 키 없을 시 mock 3건 (개발 환경 fallback).
export async function fetchHaccpPage(
  startIdx: number,
  endIdx: number
): Promise<{ rows: HaccpRow[]; total: number; error?: string }> {
  const key = loadKey();
  if (!key) {
    // mock 3건 — 키 없을 때 개발 fallback
    const mock: HaccpRow[] = [
      {
        licenseNo: "MOCK-001",
        bsshName: "(주)농심",
        industryName: "라면제조업",
        presidentName: "홍길동",
        address: "서울특별시 동작구",
        appnDate: "2010-01-15",
        appnNo: "HACCP-2010-001",
        productListName: "라면",
        bizStatus: "영업중",
      },
      {
        licenseNo: "MOCK-002",
        bsshName: "오뚜기",
        industryName: "식품제조업",
        presidentName: "김철수",
        address: "경기도 안양시",
        appnDate: "2008-06-20",
        appnNo: "HACCP-2008-002",
        productListName: "카레, 진라면",
        bizStatus: "영업중",
      },
      {
        licenseNo: "MOCK-003",
        bsshName: "(주)빙그레",
        industryName: "유가공업",
        presidentName: "이영희",
        address: "경기도 남양주시",
        appnDate: "2012-03-10",
        appnNo: "HACCP-2012-003",
        productListName: "바나나우유",
        bizStatus: "영업중",
      },
    ];
    return { rows: mock, total: mock.length, error: "KOREANNET_API_KEY 미설정 — mock 사용" };
  }

  const url = `${BASE}/${key}/I0580/json/${startIdx}/${endIdx}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { rows: [], total: 0, error: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      I0580?: {
        total_count?: string | number;
        row?: RawRow[];
        RESULT?: { CODE?: string; MSG?: string };
      };
    };
    const block = json.I0580;
    if (!block) {
      return { rows: [], total: 0, error: "응답 파싱 실패 — I0580 블록 없음" };
    }
    // INFO-200 (해당 데이터 없음) 정상 종료
    const code = block.RESULT?.CODE;
    if (code && code !== "INFO-000") {
      return {
        rows: [],
        total: typeof block.total_count === "string" ? parseInt(block.total_count) : block.total_count ?? 0,
        error: `${code} ${block.RESULT?.MSG ?? ""}`.trim(),
      };
    }
    const rows = (block.row ?? [])
      .map(toRow)
      .filter((r): r is HaccpRow => r !== null);
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
