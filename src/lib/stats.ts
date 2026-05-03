// 국가데이터처(통계청) 온라인 수집 가격 정보 어댑터
// data.go.kr 15080757
// Endpoint: http://apis.data.go.kr/1240000/bpp_openapi
// 인증: serviceKey (DATA_GO_KR_SERVICE_KEY 공통)
// 데이터: 약 120개 카테고리 × 일별 N개 SKU (라면만 2,800건)

const BASE = "http://apis.data.go.kr/1240000/bpp_openapi";

export type StatsItem = {
  itemCode: string; // A01110
  itemName: string; // 라면
  effectiveSince?: string; // "2024년 12월 19일 이후"
};

export type StatsPriceRow = {
  productId: string; // pi (e.g. 998712761)
  productName: string; // pn
  salePrice: number; // sp
  discountPrice: number; // dp
  basePrice?: number; // bp (배송비 또는 0)
  collectedDate: string; // sd YYYY-MM-DD
};

function getKey(): string | null {
  return process.env.DATA_GO_KR_SERVICE_KEY ?? null;
}

// XML → 간단 파서 (외부 의존성 없이)
function parseTagAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

function parseItemBlock(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    fields[m[1]] = m[2].trim();
  }
  return fields;
}

// 전체 품목 코드 카탈로그 조회 (123건)
export async function listItems(): Promise<StatsItem[]> {
  const key = getKey();
  if (!key) return [];

  const url = `${BASE}/getPriceItemList?serviceKey=${key}&numOfRows=200&pageNo=1`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const xml = await res.text();

  // <items> 안의 <item>들 추출
  const itemsBlocks = parseTagAll(xml, "item");
  const result: StatsItem[] = [];
  for (const block of itemsBlocks) {
    const f = parseItemBlock(block);
    if (f.ic && f.in) {
      result.push({
        itemCode: f.ic,
        itemName: f.in,
        effectiveSince: f.ed,
      });
    }
  }
  return result;
}

// 특정 itemCode의 일자별 가격 정보 조회 (rate limit: 30 tps, 1000 max per page)
// startDate/endDate: YYYYMMDD, 검색가능기간 ~D-2일
export async function getPrices(
  itemCode: string,
  startDate: string,
  endDate: string,
  pageNo = 1,
  numOfRows = 1000
): Promise<{ rows: StatsPriceRow[]; totalCount: number }> {
  const key = getKey();
  if (!key) return { rows: [], totalCount: 0 };

  const url =
    `${BASE}/getPriceInfo?serviceKey=${key}&itemCode=${itemCode}` +
    `&startDate=${startDate}&endDate=${endDate}&pageNo=${pageNo}&numOfRows=${numOfRows}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { rows: [], totalCount: 0 };
  const xml = await res.text();

  // 에러 응답 (resultCode 21=NO MSG, 22=PARAM FAIL, 99=KEY INVALID)
  const codeMatch = xml.match(/<resultCode>(\d+)<\/resultCode>/);
  if (codeMatch && codeMatch[1] !== "00") {
    return { rows: [], totalCount: 0 };
  }

  const totalMatch = xml.match(/<totalCount>(\d+)<\/totalCount>/);
  const totalCount = totalMatch ? parseInt(totalMatch[1], 10) : 0;

  const itemsBlocks = parseTagAll(xml, "item");
  const rows: StatsPriceRow[] = [];
  for (const block of itemsBlocks) {
    const f = parseItemBlock(block);
    if (f.pi && f.pn && f.sp) {
      rows.push({
        productId: f.pi,
        productName: f.pn,
        salePrice: parseInt(f.sp, 10) || 0,
        discountPrice: parseInt(f.dp || f.sp, 10) || 0,
        basePrice: parseInt(f.bp || "0", 10) || 0,
        collectedDate: f.sd ?? "",
      });
    }
  }
  return { rows, totalCount };
}

// D-N 일자 yyyymmdd 형식
function dateOffsetStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

// 데이터 publish가 들쭉날쭉이라 최근 데이터가 있는 날짜를 찾아 반환
// 라면(A01110)으로 D-2 ~ D-30 range에서 sample 호출 → 데이터 있는 날짜 첫 번째 반환
export async function findLatestDataDate(): Promise<string | null> {
  const key = getKey();
  if (!key) return null;
  const sampleItem = "A01110"; // 라면 — 보통 데이터가 매일 있음
  for (let daysAgo = 2; daysAgo <= 30; daysAgo++) {
    const date = dateOffsetStr(daysAgo);
    const url = `${BASE}/getPriceInfo?serviceKey=${key}&itemCode=${sampleItem}&startDate=${date}&endDate=${date}&pageNo=1&numOfRows=1`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const xml = await res.text();
      const codeMatch = xml.match(/<resultCode>(\d+)<\/resultCode>/);
      if (!codeMatch || codeMatch[1] !== "00") continue;
      const totalMatch = xml.match(/<totalCount>(\d+)<\/totalCount>/);
      if (totalMatch && parseInt(totalMatch[1], 10) > 0) {
        return date;
      }
    } catch {
      continue;
    }
  }
  return null;
}

// D-2 (서비스 가능 최신일 — 빠른 사용용. publish lag 있으면 findLatestDataDate 권장)
export function getServiceableDate(): string {
  return dateOffsetStr(2);
}
