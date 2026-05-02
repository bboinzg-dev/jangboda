// 출처: 중소벤처기업부 사업공고 / 엔드포인트: https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2 / 갱신주기: 실시간
// 데이터셋 ID: 15113297. 응답은 XML 표준 공공데이터 포맷(produces=application/xml).
// 외부 의존성 없이 정규식으로 <item> 블록을 파싱.
import { SOURCE_CODES, type BenefitRaw } from "../types";

const BASE_URL = "https://apis.data.go.kr/1421000/mssBizService_v2/getbizList_v2";

// XML 텍스트에서 단일 태그값 추출. CDATA 처리. 매칭 없으면 undefined.
function extractTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return undefined;
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1].trim();
  return v.length ? v : undefined;
}

// XML 본문에서 모든 <item>...</item> 블록을 분리해 반환
function extractItems(xml: string): string[] {
  const out: string[] = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// "20250130" 또는 "2025-01-30" → Date
function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^0-9]/g, "");
  if (cleaned.length < 8) return undefined;
  const y = cleaned.slice(0, 4);
  const mo = cleaned.slice(4, 6);
  const d = cleaned.slice(6, 8);
  const dt = new Date(`${y}-${mo}-${d}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

export async function fetchMssBiz(
  opts: { page?: number; perPage?: number } = {},
): Promise<BenefitRaw[]> {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("DATA_GO_KR_SERVICE_KEY 환경변수가 설정되지 않았습니다.");
  }

  const pageNo = opts.page ?? 1;
  const numOfRows = opts.perPage ?? 100;

  const url = new URL(BASE_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  // mssBizService_v2는 produces=application/xml만 지원 (swagger 명세 기준).
  // type/dataType 파라미터를 받지 않으므로 항상 XML로 응답. JSON 분기는 미래 호환을 위해 유지.

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`MSS 사업공고 API 요청 실패: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const trimmed = text.trim();

  // JSON 응답 시도 (현재는 XML만 반환되지만 호환성 유지)
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as {
        response?: { body?: { items?: { item?: unknown[] } | unknown[] } };
      };
      const itemsRaw = json.response?.body?.items;
      const items: Record<string, unknown>[] = Array.isArray(itemsRaw)
        ? (itemsRaw as Record<string, unknown>[])
        : ((itemsRaw as { item?: unknown[] } | undefined)?.item as Record<string, unknown>[]) ?? [];
      return items.map((item) => mapJsonItem(item));
    } catch {
      // JSON 파싱 실패 시 XML 처리로 폴백
    }
  }

  // XML 처리 (실제 응답 형식)
  const itemBlocks = extractItems(text);
  return itemBlocks.map((block) => mapXmlItem(block));
}

// swagger 명세 기준 응답 필드 매핑.
// 사업공고는 단순 게시물 형태(itemId/title/dataContents/applicationStartDate 등)로
// agency/category 정보가 없음. 담당부서를 agency로 사용.
function mapJsonItem(item: Record<string, unknown>): BenefitRaw {
  const get = (k: string): string | undefined => {
    const v = item[k];
    return typeof v === "string" ? v : v != null ? String(v) : undefined;
  };
  const sourceId = get("itemId") ?? "";
  return {
    sourceCode: SOURCE_CODES.MSS_BIZ,
    sourceId: String(sourceId),
    title: get("title") ?? "",
    summary: get("dataContents"),
    agency: get("writerPosition") ?? "중소벤처기업부",
    targetType: "business",
    regionCodes: ["00000"],
    detailUrl: get("viewUrl"),
    applyStartAt: parseDate(get("applicationStartDate")),
    applyEndAt: parseDate(get("applicationEndDate")),
    eligibilityRules: {
      writerName: get("writerName"),
      writerPhone: get("writerPhone"),
      writerEmail: get("writerEmail"),
      fileName: get("fileName"),
      fileUrl: get("fileUrl"),
    },
    rawData: item,
  };
}

function mapXmlItem(block: string): BenefitRaw {
  const get = (tag: string) => extractTag(block, tag);
  const sourceId = get("itemId") ?? "";
  const raw: Record<string, unknown> = {};
  // <태그>값</태그> 형태를 모두 raw에 수집 (fileName/fileUrl 중복은 마지막 값만 보존)
  const re = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    raw[m[1]] = m[2].trim();
  }
  return {
    sourceCode: SOURCE_CODES.MSS_BIZ,
    sourceId: String(sourceId),
    title: get("title") ?? "",
    summary: get("dataContents"),
    agency: get("writerPosition") ?? "중소벤처기업부",
    targetType: "business",
    regionCodes: ["00000"],
    detailUrl: get("viewUrl"),
    applyStartAt: parseDate(get("applicationStartDate")),
    applyEndAt: parseDate(get("applicationEndDate")),
    eligibilityRules: {
      writerName: get("writerName"),
      writerPhone: get("writerPhone"),
      writerEmail: get("writerEmail"),
      fileName: get("fileName"),
      fileUrl: get("fileUrl"),
    },
    rawData: raw,
  };
}
