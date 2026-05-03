// 출처: 행정안전부 공공서비스(혜택)정보 / 엔드포인트: https://api.odcloud.kr/api/gov24/v3/serviceList / 갱신주기: 일 1회
import { SOURCE_CODES, type BenefitRaw } from "../types";
import { regionFromAgency } from "../regions";

const BASE_URL = "https://api.odcloud.kr/api/gov24/v3/serviceList";

interface Gov24Item {
  서비스ID?: string;
  지원유형?: string;
  서비스명?: string;
  서비스목적요약?: string;
  지원대상?: string;
  선정기준?: string;
  지원내용?: string;
  신청방법?: string;
  신청기한?: string;
  상세조회URL?: string;
  소관기관코드?: string;
  소관기관명?: string;
  부서명?: string;
  소관기관유형?: string;
  사용자구분?: string;
  서비스분야?: string;
  접수기관?: string;
  전화문의?: string;
  등록일시?: string;
  수정일시?: string;
  [key: string]: unknown;
}

interface Gov24Response {
  currentCount?: number;
  data?: Gov24Item[];
  matchCount?: number;
  page?: number;
  perPage?: number;
  totalCount?: number;
}

// "사용자구분" 문자열을 BenefitRaw.targetType으로 매핑
function mapTargetType(userType?: string): BenefitRaw["targetType"] {
  if (!userType) return undefined;
  if (userType.includes("개인") || userType.includes("국민")) return "individual";
  if (userType.includes("가구") || userType.includes("세대")) return "household";
  if (userType.includes("기업") || userType.includes("사업자") || userType.includes("소상공인"))
    return "business";
  return "mixed";
}

// "YYYY-MM-DD" 또는 "YYYY-MM-DD HH:mm:ss" 형식 → Date (실패 시 undefined)
function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value.replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function fetchGov24(
  opts: { page?: number; perPage?: number } = {},
): Promise<BenefitRaw[]> {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("DATA_GO_KR_SERVICE_KEY 환경변수가 설정되지 않았습니다.");
  }

  const page = opts.page ?? 1;
  const perPage = opts.perPage ?? 100;

  const url = new URL(BASE_URL);
  url.searchParams.set("page", String(page));
  url.searchParams.set("perPage", String(perPage));
  url.searchParams.set("returnType", "JSON");
  url.searchParams.set("serviceKey", serviceKey);

  // 4xx/5xx 시 지수 backoff 재시도 — odcloud는 가끔 일시 throttle을 줌
  let res: Response | null = null;
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(url.toString(), { cache: "no-store" });
    if (res.ok) break;
    lastErr = `${res.status} ${res.statusText}`;
    // 마지막 시도가 아니면 1초 → 2초 backoff
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  if (!res || !res.ok) {
    throw new Error(`Gov24 API 요청 실패 (3회 재시도): ${lastErr}`);
  }

  const json = (await res.json()) as Gov24Response;
  const items = json.data ?? [];

  return items.map((item): BenefitRaw => {
    const sourceId = String(item.서비스ID ?? "");
    return {
      sourceCode: SOURCE_CODES.GOV24,
      sourceId,
      title: String(item.서비스명 ?? ""),
      summary: item.서비스목적요약,
      agency: item.소관기관명,
      category: item.서비스분야,
      targetType: mapTargetType(item.사용자구분),
      // 소관기관명에서 시도 코드 추정 — 지자체 사업이면 해당 시도, 아니면 전국("00000")
      regionCodes: regionFromAgency(item.소관기관명) ?? ["00000"],
      detailUrl: item.상세조회URL,
      applyEndAt: parseDate(item.신청기한),
      eligibilityRules: {
        지원대상: item.지원대상,
        선정기준: item.선정기준,
        지원내용: item.지원내용,
        신청방법: item.신청방법,
        지원유형: item.지원유형,
      },
      rawData: item as Record<string, unknown>,
    };
  });
}
