// 출처: 기업마당(Bizinfo) / 엔드포인트: https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do / 갱신주기: 일 1회
// 인증키 파라미터명은 공공데이터포털 키와 다른 자체 발급 키(crtfcKey).
import { SOURCE_CODES, type BenefitRaw } from "../types";

const BASE_URL = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";

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
  // bizinfo는 <item> 또는 <channel><item> 구조
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

function parsePeriod(period?: string): [Date | undefined, Date | undefined] {
  if (!period) return [undefined, undefined];
  const parts = period.split(/[~\-]/).map((s) => s.trim());
  return [parseDate(parts[0]), parseDate(parts[1])];
}

// areaNm/지역명 → 5자리 행정구역 코드 매핑은 룰 테이블 확장 시 추가. 우선은 원문 유지.
function toRegionCodes(areaNm?: string): string[] {
  if (!areaNm) return ["00000"];
  return [areaNm];
}

export async function fetchBizinfo(
  opts: { page?: number; perPage?: number } = {},
): Promise<BenefitRaw[]> {
  const crtfcKey = process.env.BIZINFO_API_KEY;
  if (!crtfcKey) {
    throw new Error("BIZINFO_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  const pageUnit = opts.perPage ?? 100;
  const pageIndex = opts.page ?? 1;

  const url = new URL(BASE_URL);
  url.searchParams.set("crtfcKey", crtfcKey);
  url.searchParams.set("dataType", "json");
  url.searchParams.set("searchCnt", String(pageUnit));
  url.searchParams.set("searchPagePerCnt", String(pageUnit));
  url.searchParams.set("searchPageIndex", String(pageIndex));

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Bizinfo API 요청 실패: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const trimmed = text.trim();

  // JSON 응답
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as {
        jsonArray?: Record<string, unknown>[];
        result?: Record<string, unknown>[];
      };
      const items = json.jsonArray ?? json.result ?? [];
      return items.map((it) => mapItem(it));
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
    const fromTag = (k: string) => extractTag(block, k);
    return mapItem({
      ...raw,
      pblancId: fromTag("pblancId"),
      pblancNm: fromTag("pblancNm") ?? fromTag("title"),
      jrsdInsttNm: fromTag("jrsdInsttNm"),
      excInsttNm: fromTag("excInsttNm"),
      bsnsSumryCn: fromTag("bsnsSumryCn") ?? fromTag("description"),
      pldirSportRealmLclasCodeNm: fromTag("pldirSportRealmLclasCodeNm"),
      pblancUrl: fromTag("pblancUrl") ?? fromTag("link"),
      reqstBeginEndDe: fromTag("reqstBeginEndDe"),
      trgetNm: fromTag("trgetNm"),
      areaNm: fromTag("areaNm"),
      hashtags: fromTag("hashtags"),
    });
  });
}

function mapItem(item: Record<string, unknown>): BenefitRaw {
  const get = (k: string): string | undefined => {
    const v = item[k];
    return typeof v === "string" ? v : v != null ? String(v) : undefined;
  };
  const [start, end] = parsePeriod(get("reqstBeginEndDe"));
  const sourceId = get("pblancId") ?? get("id") ?? get("guid") ?? "";
  // pblancUrl이 상대경로일 수 있음
  let detailUrl = get("pblancUrl") ?? get("link");
  if (detailUrl && detailUrl.startsWith("/")) {
    detailUrl = `https://www.bizinfo.go.kr${detailUrl}`;
  }
  return {
    sourceCode: SOURCE_CODES.BIZINFO,
    sourceId: String(sourceId),
    title: get("pblancNm") ?? get("title") ?? "",
    summary: get("bsnsSumryCn") ?? get("description"),
    agency: get("jrsdInsttNm") ?? get("excInsttNm"),
    category: get("pldirSportRealmLclasCodeNm"),
    targetType: "business",
    regionCodes: toRegionCodes(get("areaNm")),
    detailUrl,
    applyStartAt: start,
    applyEndAt: end,
    eligibilityRules: {
      trgetNm: get("trgetNm"),
      reqstBeginEndDe: get("reqstBeginEndDe"),
      hashtags: get("hashtags"),
      pldirSportRealmLclasCodeNm: get("pldirSportRealmLclasCodeNm"),
    },
    rawData: item,
  };
}
