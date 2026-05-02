// 식품안전나라 OpenAPI 쇠고기 이력추적 (I1810/I1820/I1830) 어댑터
//
// On-demand lookup — DB에 저장하지 않음. 사용자가 12자리 개체식별번호를 입력하면
// 3개 엔드포인트를 병렬 호출하여 통합/생산/가공이력을 한 번에 보여줌.
//
// I1810: 쇠고기(국내)이력추적 생산정보
// I1820: 쇠고기(국내)이력추적 정보 (통합)
// I1830: 쇠고기(국내)이력추적 가공관리
//
// 식약처 API는 path filter로 임의의 출력 필드를 받아주는 경향이 있어
// `ENTTY_IDNTFC_NO=값`을 일관되게 시도. 실패 시 결과는 0건으로 처리.

import { readFileSync } from "node:fs";

const BASE = "http://openapi.foodsafetykorea.go.kr/api";

// ---------- 타입 정의 ----------

export type CattleProduction = {
  enttyIdNo: string; // ENTTY_IDNTFC_NO 개체식별번호
  birthDate: string | null; // BRTH_DT 출생일자
  enttyStatus: string | null; // ENTTY_STATS_NM 개체상태
  cowKind: string | null; // COW_KND_NM 소종류
  gender: string | null; // GND_NM 성별
  farmName: string | null; // FMH_NM 농가명
  vaccineLastDate: string | null; // VACIN_LAST_INOCL_DT 백신최종접종일자
  vaccineLastSeq: string | null; // VACIN_LAST_INOCL_OPNO 백신최종접종차수
};

export type CattleProcess = {
  enttyIdNo: string; // ENTTY_IDNTFC_NO
  processPlaceCode: string | null; // PRCSS_PLC_CD 가공장소코드
  processDate: string | null; // PRCSS_DT 가공일자
  processPlaceName: string | null; // PRCSS_PLC_NM 가공장소명
};

export type CattleIntegrated = {
  enttyIdNo: string; // ENTTY_IDNTFC_NO
  slaughterPlaceName: string | null; // SLAU_PLC_NM 도축장소
  inspectionResult: string | null; // SNTT_PRSEC_NM 검사처리과(?)
  slaughterDate: string | null; // SLAU_YMD 도축일자
  address: string | null; // ADDR 주소
  inspectionPass: string | null; // SNTT_PRSEC_PASS_ENNC
  processDate: string | null; // PRCSS_DT 가공일자
  processPlaceName: string | null; // PRCSS_PLC_NM 가공장소
  birthDate: string | null; // BRTH_DT 출생일자
  enttyStatus: string | null; // ENTTY_STATS_NM 개체상태
  cowKind: string | null; // COW_KND_NM 소종류
  gender: string | null; // GND_NM 성별
  farmName: string | null; // FMH_NM 농가명
  vaccineLastDate: string | null; // VACIN_LAST_INOCL_DT
  vaccineLastSeq: string | null; // VACIN_LAST_INOCL_OPNO
};

export type CattleTraceResult = {
  found: boolean;
  enttyIdNo: string;
  integrated: CattleIntegrated | null;
  production: CattleProduction | null;
  processes: CattleProcess[];
  source: "foodsafety" | "mock" | "none";
  error?: string;
};

// ---------- 내부 ----------

type RawRow = Record<string, string | undefined>;

type ApiResponse = {
  [code: string]:
    | {
        total_count?: string;
        row?: RawRow[];
        RESULT?: { CODE?: string; MSG?: string };
      }
    | undefined;
};

function loadKey(): string | null {
  const fromEnv =
    process.env.KOREANNET_API_KEY ?? process.env.FOODSAFETY_API_KEY;
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

// 12자리 숫자 검증
function isValidEnttyIdNo(s: string): boolean {
  return /^\d{12}$/.test(s);
}

// path filter URL 빌드. 식약처는 `/{KEY}/{CODE}/json/{start}/{end}/필드명=값` 규칙.
function buildUrl(
  key: string,
  code: string,
  start: number,
  end: number,
  filterField: string,
  filterValue: string
): string {
  const filterPath = `/${filterField}=${encodeURIComponent(filterValue)}`;
  return `${BASE}/${key}/${code}/json/${start}/${end}${filterPath}`;
}

async function fetchRows(
  key: string,
  code: string,
  enttyIdNo: string
): Promise<RawRow[] | null> {
  try {
    const url = buildUrl(key, code, 1, 50, "ENTTY_IDNTFC_NO", enttyIdNo);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as ApiResponse;
    const node = json[code];
    const resultCode = node?.RESULT?.CODE;
    // INFO-000 = 성공, INFO-200 = 결과 없음 (에러 아님)
    if (resultCode && resultCode !== "INFO-000") return [];
    return node?.row ?? [];
  } catch (e) {
    console.warn(`[foodsafety/cattleTrace] ${code} fetch 실패:`, e);
    return null;
  }
}

// 케이스/공백 무시 ID 매칭
function matchesId(rowVal: string | undefined, target: string): boolean {
  if (!rowVal) return false;
  return rowVal.trim().toLowerCase() === target.trim().toLowerCase();
}

function s(v: string | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function toIntegrated(r: RawRow): CattleIntegrated {
  return {
    enttyIdNo: r.ENTTY_IDNTFC_NO ?? "",
    slaughterPlaceName: s(r.SLAU_PLC_NM),
    inspectionResult: s(r.SNTT_PRSEC_NM),
    slaughterDate: s(r.SLAU_YMD),
    address: s(r.ADDR),
    inspectionPass: s(r.SNTT_PRSEC_PASS_ENNC),
    processDate: s(r.PRCSS_DT),
    processPlaceName: s(r.PRCSS_PLC_NM),
    birthDate: s(r.BRTH_DT),
    enttyStatus: s(r.ENTTY_STATS_NM),
    cowKind: s(r.COW_KND_NM),
    gender: s(r.GND_NM),
    farmName: s(r.FMH_NM),
    vaccineLastDate: s(r.VACIN_LAST_INOCL_DT),
    vaccineLastSeq: s(r.VACIN_LAST_INOCL_OPNO),
  };
}

function toProduction(r: RawRow): CattleProduction {
  return {
    enttyIdNo: r.ENTTY_IDNTFC_NO ?? "",
    birthDate: s(r.BRTH_DT),
    enttyStatus: s(r.ENTTY_STATS_NM),
    cowKind: s(r.COW_KND_NM),
    gender: s(r.GND_NM),
    farmName: s(r.FMH_NM),
    vaccineLastDate: s(r.VACIN_LAST_INOCL_DT),
    vaccineLastSeq: s(r.VACIN_LAST_INOCL_OPNO),
  };
}

function toProcess(r: RawRow): CattleProcess {
  return {
    enttyIdNo: r.ENTTY_IDNTFC_NO ?? "",
    processPlaceCode: s(r.PRCSS_PLC_CD),
    processDate: s(r.PRCSS_DT),
    processPlaceName: s(r.PRCSS_PLC_NM),
  };
}

// 가공이력 정렬: PRCSS_DT 오름차순 (yyyymmdd 또는 yyyy-mm-dd 포맷이라 문자열 비교로 충분)
function sortProcessesAsc(arr: CattleProcess[]): CattleProcess[] {
  return [...arr].sort((a, b) => {
    const ad = a.processDate ?? "";
    const bd = b.processDate ?? "";
    if (ad === bd) return 0;
    return ad < bd ? -1 : 1;
  });
}

// 개발용 mock — API 키 없을 때 또는 명시적 mock 호출
function mockResult(enttyIdNo: string): CattleTraceResult {
  const integrated: CattleIntegrated = {
    enttyIdNo,
    slaughterPlaceName: "샘플도축장(가상)",
    inspectionResult: "합격",
    slaughterDate: "20250115",
    address: "충청남도 홍성군 ○○면 ○○리",
    inspectionPass: "Y",
    processDate: "20250118",
    processPlaceName: "샘플가공장",
    birthDate: "20221103",
    enttyStatus: "도축",
    cowKind: "한우",
    gender: "거세",
    farmName: "샘플농가",
    vaccineLastDate: "20240612",
    vaccineLastSeq: "3",
  };
  const production: CattleProduction = {
    enttyIdNo,
    birthDate: "20221103",
    enttyStatus: "도축",
    cowKind: "한우",
    gender: "거세",
    farmName: "샘플농가",
    vaccineLastDate: "20240612",
    vaccineLastSeq: "3",
  };
  const processes: CattleProcess[] = [
    {
      enttyIdNo,
      processPlaceCode: "P001",
      processDate: "20250118",
      processPlaceName: "샘플가공장(1차)",
    },
    {
      enttyIdNo,
      processPlaceCode: "P002",
      processDate: "20250121",
      processPlaceName: "샘플유통센터(2차)",
    },
  ];
  return {
    found: true,
    enttyIdNo,
    integrated,
    production,
    processes,
    source: "mock",
  };
}

// ---------- 공개 API ----------

export async function lookupCattleTrace(
  enttyIdNo: string
): Promise<CattleTraceResult> {
  const id = (enttyIdNo ?? "").trim();

  // 입력 검증 — 12자리 숫자
  if (!isValidEnttyIdNo(id)) {
    return {
      found: false,
      enttyIdNo: id,
      integrated: null,
      production: null,
      processes: [],
      source: "none",
      error: "개체식별번호는 12자리 숫자여야 합니다",
    };
  }

  const key = loadKey();
  if (!key) {
    // 키 없을 때 mock — 개발 환경 대응
    return mockResult(id);
  }

  try {
    // 3개 엔드포인트 병렬 호출
    const [i1820Rows, i1810Rows, i1830Rows] = await Promise.all([
      fetchRows(key, "I1820", id),
      fetchRows(key, "I1810", id),
      fetchRows(key, "I1830", id),
    ]);

    // 각 엔드포인트에서 ID가 정확히 일치하는 행을 추출
    const integratedRow = (i1820Rows ?? []).find((r) =>
      matchesId(r.ENTTY_IDNTFC_NO, id)
    );
    const productionRow = (i1810Rows ?? []).find((r) =>
      matchesId(r.ENTTY_IDNTFC_NO, id)
    );
    const processRows = (i1830Rows ?? []).filter((r) =>
      matchesId(r.ENTTY_IDNTFC_NO, id)
    );

    const integrated = integratedRow ? toIntegrated(integratedRow) : null;
    const production = productionRow ? toProduction(productionRow) : null;
    const processes = sortProcessesAsc(processRows.map(toProcess));

    const found = !!integrated || !!production || processes.length > 0;

    return {
      found,
      enttyIdNo: id,
      integrated,
      production,
      processes,
      source: found ? "foodsafety" : "none",
    };
  } catch (e) {
    return {
      found: false,
      enttyIdNo: id,
      integrated: null,
      production: null,
      processes: [],
      source: "none",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
