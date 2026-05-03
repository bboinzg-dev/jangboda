// 한국소비자원 참가격(parsa) OpenAPI 어댑터
//
// 엔드포인트: http://openapi.price.go.kr/openApiImpl/ProductPriceInfoService/
//   - HTTPS는 동작하지 않음. 반드시 HTTP 사용.
// 인증: ?ServiceKey={KEY} (대문자 S)
// 키: .env의 DATA_GO_KR_SERVICE_KEY (식약처 영양성분 등 다른 어댑터와 공유)
// 응답 포맷: XML
//
// 검증된 operation:
//   - getStoreInfoSvc.do      ✅ (entpId 등)
//   - getProductInfoSvc.do    ✅ (goodId 등 — <item> 래퍼)
//   - getProductPriceInfoSvc.do  → goodInspectDay 파라미터 필요 (이번 라운드 미구현)
//   - getStandardInfoSvc.do   → classCode 파라미터 필요 (이번 라운드 미구현)
//
// 호출 한도: 2,000건/일/operation, 30 TPS. 갱신 주기: 매주 금요일.
// XML 구조가 평면적이라 정규식 파싱으로 충분 — fast-xml-parser 의존성 추가하지 않음.

import { readFileSync } from "node:fs";

const BASE = "http://openapi.price.go.kr/openApiImpl/ProductPriceInfoService";

export type ParsaStore = {
  entpId: string;
  entpName: string;
  entpTypeCode: string | null; // LM(대형마트), SM(슈퍼마켓), DP(백화점), TM(전통시장) 등
  entpAreaCode: string | null;
  areaDetailCode: string | null;
  entpTelno: string | null;
  postNo: string | null;
  addrBasic: string | null; // plmkAddrBasic
  addrDetail: string | null; // plmkAddrDetail
  roadAddrBasic: string | null;
  roadAddrDetail: string | null;
  xMapCoord: string | null;
  yMapCoord: string | null;
};

export type ParsaProduct = {
  goodId: string;
  goodName: string;
  productEntpCode: string | null; // 제조사 코드 (참가격 내부)
  goodUnitDivCode: string | null; // 단위 코드: G, ML, EA 등
  goodBaseCnt: string | null; // 기준 수량 (예: 100)
  goodSmlclsCode: string | null; // 소분류 코드
  goodTotalCnt: string | null; // 전체 수량 (예: 1000)
  goodTotalDivCode: string | null; // 전체 단위 코드
  // 사양 상 받기로 한 카테고리 코드/명은 현재 응답에 직접 노출되지 않음.
  // goodSmlclsCode를 카테고리 식별자로 활용 (이름은 Standard API로 후속 매핑 필요).
  goodTotalDivName: string | null; // (응답에 없을 수 있음 — null 허용)
  goodCategoryCode: string | null; // = goodSmlclsCode 미러
  goodCategoryName: string | null; // (별도 표준코드 API 매핑 전까지는 null)
  detailMean: string | null; // 상세 의미 (예: "90g*4개")
};

// .env에서 DATA_GO_KR_SERVICE_KEY 읽기 — process.env가 비어 있는 환경(스크립트 등)을 위해 fallback.
function loadKey(): string | null {
  const fromEnv = process.env.DATA_GO_KR_SERVICE_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    const txt = readFileSync(".env", "utf8");
    const m = txt.match(/DATA_GO_KR_SERVICE_KEY\s*=\s*"?([^"\n\r]+)"?/);
    if (m) return m[1].trim();
  } catch {
    // .env 없을 수 있음
  }
  return null;
}

// 빈 문자열은 null
function toStrOrNull(v: string | undefined): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// XML decode (최소) — &amp; &lt; &gt; &quot; &apos; 만 처리.
// 참가격 응답엔 CDATA가 거의 없고 한글 평문이라 충분.
function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// 단일 블록 XML에서 <tag>값</tag> 추출. 없으면 undefined.
function pick(block: string, tag: string): string | undefined {
  // 태그명에 점(.)이 없는 단순 태그만 전제 (참가격은 영문 카멜케이스).
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
  const m = block.match(re);
  if (!m) return undefined;
  return decodeXml(m[1]).trim();
}

// 응답 XML에서 resultCode/resultMsg 에러 블록 검사.
// 정상 응답은 <result>...</result>이지만, 에러 시 <resultCode>01</resultCode> 형태로 옴.
function checkErrorEnvelope(xml: string): string | null {
  const code = xml.match(/<resultCode>([^<]+)<\/resultCode>/);
  if (!code) return null;
  const codeVal = code[1].trim();
  if (!codeVal || codeVal === "00") return null;
  const msg = xml.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1].trim() ?? "";
  return `참가격 API 에러 ${codeVal} ${msg}`.trim();
}

// 매장(getStoreInfoSvc)의 한 페이지 fetch.
// 키 없거나 네트워크 실패 시 mock(3건) 또는 빈 배열 + error 메시지 반환.
export async function fetchParsaStoresPage(
  pageNo: number,
  numOfRows: number
): Promise<{ rows: ParsaStore[]; total: number; error?: string }> {
  const key = loadKey();
  if (!key) {
    const mock: ParsaStore[] = [
      {
        entpId: "MOCK-1",
        entpName: "이마트연수점",
        entpTypeCode: "LM",
        entpAreaCode: "020700000",
        areaDetailCode: "020710000",
        entpTelno: "032-820-1234",
        postNo: "21975",
        addrBasic: "인천광역시 연수구 동춘동 926-9 이마트",
        addrDetail: "이마트 연수점",
        roadAddrBasic: "인천광역시 연수구 경원대로 184",
        roadAddrDetail: "(동춘동)",
        xMapCoord: null,
        yMapCoord: null,
      },
      {
        entpId: "MOCK-2",
        entpName: "롯데마트 잠실점",
        entpTypeCode: "LM",
        entpAreaCode: "020100000",
        areaDetailCode: "020110000",
        entpTelno: "02-2143-2114",
        postNo: "05551",
        addrBasic: "서울 송파구 신천동 29",
        addrDetail: "롯데마트 잠실점",
        roadAddrBasic: "서울 송파구 올림픽로 240",
        roadAddrDetail: null,
        xMapCoord: "37.512200",
        yMapCoord: "127.102100",
      },
      {
        entpId: "MOCK-3",
        entpName: "광장시장",
        entpTypeCode: "TM",
        entpAreaCode: "020100000",
        areaDetailCode: "020111000",
        entpTelno: "02-2267-0291",
        postNo: "03196",
        addrBasic: "서울 종로구 예지동 6-1",
        addrDetail: null,
        roadAddrBasic: "서울 종로구 창경궁로 88",
        roadAddrDetail: null,
        xMapCoord: null,
        yMapCoord: null,
      },
    ];
    return {
      rows: mock,
      total: mock.length,
      error: "DATA_GO_KR_SERVICE_KEY 미설정 — mock 사용",
    };
  }

  const url = `${BASE}/getStoreInfoSvc.do?ServiceKey=${encodeURIComponent(
    key
  )}&pageNo=${pageNo}&numOfRows=${numOfRows}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { rows: [], total: 0, error: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    const envErr = checkErrorEnvelope(xml);
    if (envErr) {
      return { rows: [], total: 0, error: envErr };
    }

    // 각 매장 VO 블록 추출. 태그명에 점이 들어있어 클래스명 escape 필요.
    const VO_RE =
      /<iros\.openapi\.service\.vo\.entpInfoVO>([\s\S]*?)<\/iros\.openapi\.service\.vo\.entpInfoVO>/g;
    const rows: ParsaStore[] = [];
    let m: RegExpExecArray | null;
    while ((m = VO_RE.exec(xml)) !== null) {
      const block = m[1];
      const entpId = toStrOrNull(pick(block, "entpId"));
      const entpName = toStrOrNull(pick(block, "entpName"));
      if (!entpId || !entpName) continue;
      rows.push({
        entpId,
        entpName,
        entpTypeCode: toStrOrNull(pick(block, "entpTypeCode")),
        entpAreaCode: toStrOrNull(pick(block, "entpAreaCode")),
        areaDetailCode: toStrOrNull(pick(block, "areaDetailCode")),
        entpTelno: toStrOrNull(pick(block, "entpTelno")),
        postNo: toStrOrNull(pick(block, "postNo")),
        addrBasic: toStrOrNull(pick(block, "plmkAddrBasic")),
        addrDetail: toStrOrNull(pick(block, "plmkAddrDetail")),
        roadAddrBasic: toStrOrNull(pick(block, "roadAddrBasic")),
        roadAddrDetail: toStrOrNull(pick(block, "roadAddrDetail")),
        xMapCoord: toStrOrNull(pick(block, "xMapCoord")),
        yMapCoord: toStrOrNull(pick(block, "yMapCoord")),
      });
    }

    // total은 응답 envelope에 명시되지 않음 — 페이지 길이 < numOfRows면 끝으로 간주.
    // 호출자는 rows.length를 사용해 페이징 종료를 판단할 수 있음.
    return { rows, total: rows.length };
  } catch (e) {
    return {
      rows: [],
      total: 0,
      error: `fetch 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// 표준코드 정보 (getStandardInfoSvc)의 항목 타입.
// classCode: AL(소분류), BU(업태), AR(지역), UT(단위/용량)
export type ParsaStandardItem = {
  classCode: string;
  code: string;
  codeName: string;
  highCode: string | null;
};

/**
 * 표준코드 정보 fetch — classCode별 전체 코드 트리를 가져온다.
 * 응답 wrapper는 <iros.openapi.service.vo.stdInfoVO>...</iros.openapi.service.vo.stdInfoVO>.
 * 전체 ~500건 규모라 단일 페이지(numOfRows=1000)로 충분.
 */
export async function fetchParsaStandardPage(
  classCode: "AL" | "BU" | "AR" | "UT",
  numOfRows = 1000
): Promise<{ rows: ParsaStandardItem[]; total: number; error?: string }> {
  const key = loadKey();
  if (!key) {
    // mock: classCode 별 샘플 2건씩
    const mockMap: Record<string, ParsaStandardItem[]> = {
      AL: [
        { classCode: "AL", code: "030101001", codeName: "계란", highCode: "030101000" },
        { classCode: "AL", code: "030204006", codeName: "꽃소금", highCode: "030204000" },
      ],
      BU: [
        { classCode: "BU", code: "LM", codeName: "대형마트", highCode: null },
        { classCode: "BU", code: "TM", codeName: "전통시장", highCode: null },
      ],
      AR: [
        { classCode: "AR", code: "020100000", codeName: "서울특별시", highCode: null },
        { classCode: "AR", code: "020700000", codeName: "인천광역시", highCode: null },
      ],
      UT: [
        { classCode: "UT", code: "G", codeName: "그램", highCode: null },
        { classCode: "UT", code: "ML", codeName: "밀리리터", highCode: null },
      ],
    };
    const mock = mockMap[classCode] ?? [];
    return {
      rows: mock,
      total: mock.length,
      error: "DATA_GO_KR_SERVICE_KEY 미설정 — mock 사용",
    };
  }

  const url = `${BASE}/getStandardInfoSvc.do?ServiceKey=${encodeURIComponent(
    key
  )}&classCode=${classCode}&pageNo=1&numOfRows=${numOfRows}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { rows: [], total: 0, error: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    const envErr = checkErrorEnvelope(xml);
    if (envErr) {
      return { rows: [], total: 0, error: envErr };
    }

    // VO 블록 추출 — 클래스명에 점이 있어 escape 필수.
    const VO_RE =
      /<iros\.openapi\.service\.vo\.stdInfoVO>([\s\S]*?)<\/iros\.openapi\.service\.vo\.stdInfoVO>/g;
    const rows: ParsaStandardItem[] = [];
    let m: RegExpExecArray | null;
    while ((m = VO_RE.exec(xml)) !== null) {
      const block = m[1];
      const code = toStrOrNull(pick(block, "code"));
      const codeName = toStrOrNull(pick(block, "codeName"));
      if (!code || !codeName) continue;
      rows.push({
        classCode,
        code,
        codeName,
        highCode: toStrOrNull(pick(block, "highCode")),
      });
    }

    return { rows, total: rows.length };
  } catch (e) {
    return {
      rows: [],
      total: 0,
      error: `fetch 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// 상품(getProductInfoSvc)의 한 페이지 fetch.
// 응답 wrapper는 <item>...</item>.
export async function fetchParsaProductsPage(
  pageNo: number,
  numOfRows: number
): Promise<{ rows: ParsaProduct[]; total: number; error?: string }> {
  const key = loadKey();
  if (!key) {
    const mock: ParsaProduct[] = [
      {
        goodId: "MOCK-1",
        goodName: "해표 꽃소금(1kg)",
        productEntpCode: "484",
        goodUnitDivCode: "G",
        goodBaseCnt: "100",
        goodSmlclsCode: "030204006",
        goodTotalCnt: "1000",
        goodTotalDivCode: "G",
        goodTotalDivName: null,
        goodCategoryCode: "030204006",
        goodCategoryName: null,
        detailMean: null,
      },
      {
        goodId: "MOCK-2",
        goodName: "도브 센서티브 뷰티바(4개)",
        productEntpCode: "466",
        goodUnitDivCode: "EA",
        goodBaseCnt: "1",
        goodSmlclsCode: "030301006",
        goodTotalCnt: "4",
        goodTotalDivCode: "EA",
        goodTotalDivName: null,
        goodCategoryCode: "030301006",
        goodCategoryName: null,
        detailMean: "90g*4개",
      },
    ];
    return {
      rows: mock,
      total: mock.length,
      error: "DATA_GO_KR_SERVICE_KEY 미설정 — mock 사용",
    };
  }

  const url = `${BASE}/getProductInfoSvc.do?ServiceKey=${encodeURIComponent(
    key
  )}&pageNo=${pageNo}&numOfRows=${numOfRows}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { rows: [], total: 0, error: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    const envErr = checkErrorEnvelope(xml);
    if (envErr) {
      return { rows: [], total: 0, error: envErr };
    }

    // 상품은 <item> 래퍼. 단순 태그라 escape 불필요.
    const ITEM_RE = /<item>([\s\S]*?)<\/item>/g;
    const rows: ParsaProduct[] = [];
    let m: RegExpExecArray | null;
    while ((m = ITEM_RE.exec(xml)) !== null) {
      const block = m[1];
      const goodId = toStrOrNull(pick(block, "goodId"));
      const goodName = toStrOrNull(pick(block, "goodName"));
      if (!goodId || !goodName) continue;
      const smlcls = toStrOrNull(pick(block, "goodSmlclsCode"));
      rows.push({
        goodId,
        goodName,
        productEntpCode: toStrOrNull(pick(block, "productEntpCode")),
        goodUnitDivCode: toStrOrNull(pick(block, "goodUnitDivCode")),
        goodBaseCnt: toStrOrNull(pick(block, "goodBaseCnt")),
        goodSmlclsCode: smlcls,
        goodTotalCnt: toStrOrNull(pick(block, "goodTotalCnt")),
        goodTotalDivCode: toStrOrNull(pick(block, "goodTotalDivCode")),
        goodTotalDivName: toStrOrNull(pick(block, "goodTotalDivName")),
        // 응답에 카테고리명/코드 별도 노출 없으므로 smlclsCode를 카테고리 식별자로 사용.
        goodCategoryCode: smlcls,
        goodCategoryName: toStrOrNull(pick(block, "goodCategoryName")),
        detailMean: toStrOrNull(pick(block, "detailMean")),
      });
    }

    return { rows, total: rows.length };
  } catch (e) {
    return {
      rows: [],
      total: 0,
      error: `fetch 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// 가격 정보 (getProductPriceInfoSvc) 항목 타입.
// inspectDay(YYYYMMDD) × entpId × goodId 단위로 1행.
export type ParsaPriceItem = {
  inspectDay: string;
  entpId: string;
  goodId: string;
  price: number;
  plusoneYn: boolean;
  discountYn: boolean;
  discountStart: string | null;
  discountEnd: string | null;
  inputDttm: string | null;
};

// "Y" / "N" 문자열을 boolean으로. 그 외/빈값은 false.
function ynToBool(v: string | undefined | null): boolean {
  if (!v) return false;
  return v.trim().toUpperCase() === "Y";
}

/**
 * 단일 매장(entpId)의 특정 inspectDay 가격 조회.
 * 반환되는 rows는 그 매장의 모든 상품(goodId)별 가격 1행씩.
 * 매장 615개 × 한 inspectDay에 대해 호출하면 전체 가격을 채울 수 있다.
 *
 * 응답 wrapper는 <item>...</item> (상품 API와 동일).
 */
export async function fetchParsaPriceByStore(
  entpId: string,
  inspectDay: string
): Promise<{ rows: ParsaPriceItem[]; error?: string }> {
  const key = loadKey();
  if (!key) {
    // mock: 2건
    const mock: ParsaPriceItem[] = [
      {
        inspectDay,
        entpId,
        goodId: "MOCK-1",
        price: 1100,
        plusoneYn: false,
        discountYn: false,
        discountStart: null,
        discountEnd: null,
        inputDttm: "2026-04-25 10:00:00",
      },
      {
        inspectDay,
        entpId,
        goodId: "MOCK-2",
        price: 4990,
        plusoneYn: false,
        discountYn: true,
        discountStart: "20260420",
        discountEnd: "20260426",
        inputDttm: "2026-04-25 10:00:00",
      },
    ];
    return {
      rows: mock,
      error: "DATA_GO_KR_SERVICE_KEY 미설정 — mock 사용",
    };
  }

  const url = `${BASE}/getProductPriceInfoSvc.do?ServiceKey=${encodeURIComponent(
    key
  )}&entpId=${encodeURIComponent(entpId)}&goodInspectDay=${encodeURIComponent(
    inspectDay
  )}&numOfRows=1000`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { rows: [], error: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    const envErr = checkErrorEnvelope(xml);
    if (envErr) {
      return { rows: [], error: envErr };
    }

    // 가격 응답은 <item> 래퍼 (단순 태그).
    const ITEM_RE = /<item>([\s\S]*?)<\/item>/g;
    const rows: ParsaPriceItem[] = [];
    let m: RegExpExecArray | null;
    while ((m = ITEM_RE.exec(xml)) !== null) {
      const block = m[1];
      const itemEntpId = toStrOrNull(pick(block, "entpId")) ?? entpId;
      const goodId = toStrOrNull(pick(block, "goodId"));
      const insp = toStrOrNull(pick(block, "goodInspectDay")) ?? inspectDay;
      const priceStr = toStrOrNull(pick(block, "goodPrice"));
      if (!goodId || !priceStr) continue;
      const priceNum = parseInt(priceStr, 10);
      if (!Number.isFinite(priceNum)) continue;

      rows.push({
        inspectDay: insp,
        entpId: itemEntpId,
        goodId,
        price: priceNum,
        plusoneYn: ynToBool(pick(block, "plusoneYn")),
        discountYn: ynToBool(pick(block, "goodDcYn")),
        discountStart: toStrOrNull(pick(block, "goodDcStartDay")),
        discountEnd: toStrOrNull(pick(block, "goodDcEndDay")),
        inputDttm: toStrOrNull(pick(block, "inputDttm")),
      });
    }

    return { rows };
  } catch (e) {
    return {
      rows: [],
      error: `fetch 실패: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * 가장 최근의 데이터 있는 inspectDay를 찾아 반환.
 * 후보 금요일 목록을 순회하며 entpId="786" 매장에 가격 데이터가 있으면 그 날짜를 반환.
 * 모두 비어있으면 null.
 *
 * 후보 리스트는 hard-coded — 동적 금요일 계산을 하지 않아 호출 시간을 절약.
 * (참가격은 매주 금요일 갱신, 2026-04-24가 라이브 검증된 최신 데이터 보유일.)
 */
export async function findLatestParsaInspectDay(): Promise<string | null> {
  const candidates = [
    "20260424",
    "20260417",
    "20260410",
    "20260403",
    "20260327",
    "20260320",
    "20260313",
    "20260306",
  ];
  // 키 미설정(mock) 환경에서는 후보 첫 항목 반환 (mock은 항상 데이터 반환).
  const key = loadKey();
  if (!key) return candidates[0];

  for (const day of candidates) {
    const r = await fetchParsaPriceByStore("786", day);
    if (r.rows.length > 0) return day;
    // 30 TPS 보호
    await new Promise((r) => setTimeout(r, 35));
  }
  return null;
}
