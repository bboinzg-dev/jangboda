// 출처: 서울 열린데이터광장 / 엔드포인트: http://openapi.seoul.go.kr:8088/{KEY}/json/{SERVICE}/{START}/{END}/ / 갱신주기: 일~월 단위
// 청년/소상공인 관련 데이터셋을 묶어 호출. 각 데이터셋의 SERVICE 이름과 응답 row 키는 데이터셋마다 상이.
// 운영 중 정확한 SERVICE 이름을 확인되는 대로 SEOUL_DATASETS에 등록/수정.
import { SOURCE_CODES, type BenefitRaw } from "../types";

const BASE_URL = "http://openapi.seoul.go.kr:8088";
const SEOUL_REGION_CODE = "11000"; // 서울특별시 광역코드

interface SeoulDataset {
  service: string; // OpenAPI SERVICE 이름
  label: string; // 사람이 읽을 라벨 (category로 사용)
}

// 서울시 청년수당/소상공인 지원 등 보조금성 데이터셋. 운영 중 검증/추가 필요.
// 정확한 SERVICE 이름은 https://data.seoul.go.kr/ 에서 데이터셋별로 확인.
const SEOUL_DATASETS: SeoulDataset[] = [
  { service: "youthAllowanceList", label: "청년수당" }, // 서울시 청년수당
  { service: "smallBizSupportList", label: "소상공인 지원사업" }, // 서울시 소상공인 지원
];

interface SeoulRow {
  [key: string]: unknown;
}

interface SeoulResponse {
  // 응답 최상위 키는 SERVICE 이름과 동일
  [key: string]:
    | {
        list_total_count?: number;
        RESULT?: { CODE?: string; MESSAGE?: string };
        row?: SeoulRow[];
      }
    | undefined;
}

// 서울 OpenAPI는 통상 YYYYMMDD 또는 YYYY-MM-DD 형식의 일자 필드를 사용
function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^0-9]/g, "");
  if (cleaned.length < 8) return undefined;
  const dt = new Date(
    `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}T00:00:00`,
  );
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

// row에서 후보 키 중 첫 번째 값을 string으로 반환
function pick(row: SeoulRow, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim().length) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

async function fetchOneDataset(
  key: string,
  ds: SeoulDataset,
  start: number,
  end: number,
): Promise<BenefitRaw[]> {
  const url = `${BASE_URL}/${encodeURIComponent(key)}/json/${encodeURIComponent(
    ds.service,
  )}/${start}/${end}/`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `서울 OpenAPI 요청 실패 (${ds.service}): ${res.status} ${res.statusText}`,
    );
  }

  const json = (await res.json()) as SeoulResponse;
  const block = json[ds.service];
  if (!block) {
    // RESULT 코드 INFO-200 등은 결과 없음. 빈 배열 반환.
    return [];
  }
  const rows = block.row ?? [];

  return rows.map((row): BenefitRaw => {
    // 키 명이 데이터셋마다 다르므로 광범위한 후보 매핑
    const id = pick(row, ["ID", "SEQ", "POLICY_ID", "BSNS_ID", "BIZ_ID", "NO"]);
    const title = pick(row, [
      "TITLE",
      "POLICY_NM",
      "BSNS_NM",
      "BIZ_NM",
      "PBANC_NM",
      "SVC_NM",
      "SUBJECT",
    ]);
    const summary = pick(row, ["CONTENTS", "POLICY_CN", "BSNS_SUMRY_CN", "DESC", "DETAIL"]);
    const agency = pick(row, ["DEPT", "DEPT_NM", "JRSD_INSTT_NM", "INSTT_NM", "ORG_NM"]);
    const detailUrl = pick(row, ["URL", "DETAIL_URL", "LINK", "PBANC_URL"]);
    const start_dt = pick(row, [
      "REQST_BEGIN_DE",
      "BGNDE",
      "RCEPT_BGNDE",
      "APP_START",
      "START_DT",
    ]);
    const end_dt = pick(row, ["REQST_END_DE", "ENDDE", "RCEPT_ENDDE", "APP_END", "END_DT"]);

    return {
      sourceCode: SOURCE_CODES.SEOUL,
      sourceId: `${ds.service}:${id ?? title ?? Math.random().toString(36).slice(2)}`,
      title: title ?? ds.label,
      summary,
      agency: agency ?? "서울특별시",
      category: ds.label,
      targetType: "individual",
      regionCodes: [SEOUL_REGION_CODE],
      detailUrl,
      applyStartAt: parseDate(start_dt),
      applyEndAt: parseDate(end_dt),
      rawData: row as Record<string, unknown>,
    };
  });
}

export async function fetchSeoulData(
  opts: { start?: number; end?: number } = {},
): Promise<BenefitRaw[]> {
  const key = process.env.SEOUL_DATA_KEY;
  if (!key) {
    throw new Error("SEOUL_DATA_KEY 환경변수가 설정되지 않았습니다.");
  }

  const start = opts.start ?? 1;
  const end = opts.end ?? 100;

  const all: BenefitRaw[] = [];
  for (const ds of SEOUL_DATASETS) {
    try {
      const items = await fetchOneDataset(key, ds, start, end);
      all.push(...items);
    } catch (err) {
      // 데이터셋 하나가 실패해도 나머지는 계속 진행
      console.warn(`[seoulData] ${ds.service} 수집 실패:`, err);
    }
  }
  return all;
}
