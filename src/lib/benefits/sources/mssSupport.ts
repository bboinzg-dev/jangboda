// 출처: 중소벤처기업부 중소기업 지원사업 공고조회 / 엔드포인트: https://apis.data.go.kr/1421000/bizinfo/getBizinfoSupportList / 갱신주기: 일 1회
// JSON/XML 모두 지원. JSON 우선, 실패 시 XML 폴백.
import { SOURCE_CODES, type BenefitRaw } from "../types";

const BASE_URL = "https://apis.data.go.kr/1421000/bizinfo/getBizinfoSupportList";

function extractTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return undefined;
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1].trim();
  return v.length ? v : undefined;
}

function extractItems(xml: string): string[] {
  const out: string[] = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

// "20250130" 또는 "2025-01-30" → Date
function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/[^0-9]/g, "");
  if (cleaned.length < 8) return undefined;
  const dt = new Date(
    `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}T00:00:00`,
  );
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

// "20250130~20250215" → [Date, Date]. 단일 날짜는 [Date, undefined].
function parsePeriod(period?: string): [Date | undefined, Date | undefined] {
  if (!period) return [undefined, undefined];
  const parts = period.split(/[~\-]/).map((s) => s.trim());
  return [parseDate(parts[0]), parseDate(parts[1])];
}

export async function fetchMssSupport(
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
  url.searchParams.set("dataType", "json");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`MSS 지원사업 API 요청 실패: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const trimmed = text.trim();

  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as {
        response?: { body?: { items?: { item?: unknown[] } | unknown[] } };
      };
      const itemsRaw = json.response?.body?.items;
      const items: Record<string, unknown>[] = Array.isArray(itemsRaw)
        ? (itemsRaw as Record<string, unknown>[])
        : ((itemsRaw as { item?: unknown[] } | undefined)?.item as Record<string, unknown>[]) ?? [];
      return items.map((item) => mapItem(item));
    } catch {
      // XML 폴백
    }
  }

  const blocks = extractItems(text);
  return blocks.map((block) => {
    const raw: Record<string, unknown> = {};
    const re = /<([a-zA-Z0-9_]+)>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) raw[m[1]] = m[2].trim();
    // extractTag로 일관된 매핑 적용
    const fromTag = (k: string) => extractTag(block, k);
    return mapItem({
      ...raw,
      pblancId: fromTag("pblancId"),
      pblancNm: fromTag("pblancNm"),
      jrsdInsttNm: fromTag("jrsdInsttNm"),
      excInsttNm: fromTag("excInsttNm"),
      reqstBeginEndDe: fromTag("reqstBeginEndDe"),
      bsnsSumryCn: fromTag("bsnsSumryCn"),
      pldirSportRealmLclasCodeNm: fromTag("pldirSportRealmLclasCodeNm"),
      pblancUrl: fromTag("pblancUrl"),
      trgetNm: fromTag("trgetNm"),
      areaNm: fromTag("areaNm"),
    });
  });
}

function mapItem(item: Record<string, unknown>): BenefitRaw {
  const get = (k: string): string | undefined => {
    const v = item[k];
    return typeof v === "string" ? v : v != null ? String(v) : undefined;
  };
  const [start, end] = parsePeriod(get("reqstBeginEndDe"));
  const sourceId = get("pblancId") ?? get("id") ?? "";
  const areaNm = get("areaNm");
  return {
    sourceCode: SOURCE_CODES.MSS_SUPPORT,
    sourceId: String(sourceId),
    title: get("pblancNm") ?? "",
    summary: get("bsnsSumryCn"),
    agency: get("jrsdInsttNm") ?? get("excInsttNm"),
    category: get("pldirSportRealmLclasCodeNm"),
    targetType: "business",
    regionCodes: areaNm ? [areaNm] : ["00000"],
    detailUrl: get("pblancUrl"),
    applyStartAt: start,
    applyEndAt: end,
    eligibilityRules: {
      trgetNm: get("trgetNm"),
      reqstBeginEndDe: get("reqstBeginEndDe"),
      pldirSportRealmLclasCodeNm: get("pldirSportRealmLclasCodeNm"),
    },
    rawData: item,
  };
}
