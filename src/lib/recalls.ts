// 식약처 회수·판매중지 식품 정보 어댑터 (I0490)
// 엔드포인트: http://openapi.foodsafetykorea.go.kr/api/{KEY}/I0490/json/{startIdx}/{endIdx}
// 인증키: KOREANNET_API_KEY (foodsafety.ts와 동일하게 재사용)

const BASE = "http://openapi.foodsafetykorea.go.kr/api";
const SERVICE_CODE = "I0490";
const PAGE_SIZE = 1000;
const MAX_RECORDS = 5000; // 폭주 방지

export type RecallItem = {
  externalSeq: string;
  productName: string;
  manufacturer?: string;
  barcode?: string;
  reason: string;
  grade?: string;
  productType?: string;
  foodTypeName?: string;
  packageUnit?: string;
  manufacturedAt?: string;
  expiryInfo?: string;
  recallMethod?: string;
  imageUrls: string[];
  manufacturerAddress?: string;
  manufacturerTel?: string;
  licenseNo?: string;
  reportNo?: string;
  registeredAt: Date;
};

export type RecallsFetchResult = {
  recalls: RecallItem[];
  usedMock: boolean;
  total: number;
  error?: string;
};

// 식약처 I0490 응답 row 타입
type I0490Row = {
  RTRVLDSUSE_SEQ?: string;
  PRDTNM?: string;
  BSSHNM?: string;
  BRCDNO?: string;
  RTRVLPRVNS?: string;
  RTRVL_GRDCD_NM?: string;
  PRDLST_TYPE?: string;
  PRDLST_CD_NM?: string;
  FRMLCUNIT?: string;
  MNFDT?: string;
  DISTBTMLMT?: string;
  RTRVLPLANDOC_RTRVLMTHD?: string;
  IMG_FILE_PATH?: string;
  ADDR?: string;
  TELNO?: string;
  LCNS_NO?: string;
  PRDLST_REPORT_NO?: string;
  CRET_DTM?: string;
};

type I0490Response = {
  I0490?: {
    total_count?: string;
    RESULT?: { CODE?: string; MSG?: string };
    row?: I0490Row[];
  };
  RESULT?: { CODE?: string; MSG?: string };
};

function loadKey(): string | null {
  // foodsafety.ts와 동일한 패턴 — KOREANNET_API_KEY 우선
  return process.env.KOREANNET_API_KEY ?? process.env.FOODSAFETY_API_KEY ?? null;
}

// "YYYY-MM-DD HH:MM:SS.ffffff" → Date. 실패 시 현재 시각 반환.
function parseCretDtm(s: string | undefined): Date {
  if (!s) return new Date();
  // 공백을 'T'로 바꿔 ISO처럼 처리. 마이크로초는 ms로 잘라냄.
  const trimmed = s.trim().replace(" ", "T");
  // 소수점 6자리 → 3자리(JS Date는 ms까지)
  const normalized = trimmed.replace(/\.(\d{3})\d*$/, ".$1");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) {
    // ISO 파싱 실패 시 fallback: 정규식으로 분해
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
    if (m) {
      const [, y, mo, da, h, mi, se] = m;
      const d2 = new Date(
        Date.UTC(
          parseInt(y, 10),
          parseInt(mo, 10) - 1,
          parseInt(da, 10),
          parseInt(h, 10),
          parseInt(mi, 10),
          parseInt(se, 10)
        )
      );
      // KST 보정 (UTC+9): 입력이 KST라고 가정
      d2.setUTCHours(d2.getUTCHours() - 9);
      return d2;
    }
    return new Date();
  }
  return d;
}

// IMG_FILE_PATH는 콤마+공백 구분 다중 URL
function parseImageUrls(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(/,\s*/)
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

function emptyToUndef(s: string | undefined | null): string | undefined {
  if (s == null) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t;
}

function rowToItem(r: I0490Row): RecallItem | null {
  const seq = r.RTRVLDSUSE_SEQ?.trim();
  const name = r.PRDTNM?.trim();
  const reason = r.RTRVLPRVNS?.trim() ?? "";
  // 필수 키가 없으면 스킵
  if (!seq || !name) return null;

  return {
    externalSeq: seq,
    productName: name,
    manufacturer: emptyToUndef(r.BSSHNM),
    barcode: emptyToUndef(r.BRCDNO),
    reason,
    grade: emptyToUndef(r.RTRVL_GRDCD_NM),
    productType: emptyToUndef(r.PRDLST_TYPE),
    foodTypeName: emptyToUndef(r.PRDLST_CD_NM),
    packageUnit: emptyToUndef(r.FRMLCUNIT),
    manufacturedAt: emptyToUndef(r.MNFDT),
    expiryInfo: emptyToUndef(r.DISTBTMLMT),
    recallMethod: emptyToUndef(r.RTRVLPLANDOC_RTRVLMTHD),
    imageUrls: parseImageUrls(r.IMG_FILE_PATH),
    manufacturerAddress: emptyToUndef(r.ADDR),
    manufacturerTel: emptyToUndef(r.TELNO),
    licenseNo: emptyToUndef(r.LCNS_NO),
    reportNo: emptyToUndef(r.PRDLST_REPORT_NO),
    registeredAt: parseCretDtm(r.CRET_DTM),
  };
}

function mockRecalls(): RecallItem[] {
  const now = new Date();
  return [
    {
      externalSeq: "MOCK-0001",
      productName: "테스트 회수 과자",
      manufacturer: "(주)테스트제과",
      barcode: "8800000000001",
      reason: "이물(금속) 혼입 우려",
      grade: "2등급",
      productType: "가공식품",
      foodTypeName: "과자",
      packageUnit: "100g",
      manufacturedAt: "2026-04-01",
      expiryInfo: "제조일로부터 12개월",
      recallMethod: "회수후 폐기",
      imageUrls: [],
      manufacturerAddress: "서울특별시 강남구 테스트로 1",
      manufacturerTel: "02-0000-0000",
      licenseNo: "00000000",
      reportNo: "00000000000",
      registeredAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1),
    },
    {
      externalSeq: "MOCK-0002",
      productName: "테스트 음료",
      manufacturer: "(주)테스트음료",
      barcode: "8800000000002",
      reason: "유통기한 표시 오류",
      grade: "3등급",
      productType: "가공식품",
      foodTypeName: "음료류",
      packageUnit: "500ml",
      manufacturedAt: "데이터없음",
      expiryInfo: "12개월",
      recallMethod: "재포장",
      imageUrls: [],
      manufacturerAddress: "경기도 성남시 분당구 테스트로 2",
      manufacturerTel: "031-000-0000",
      licenseNo: "00000001",
      reportNo: "00000000001",
      registeredAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3),
    },
    {
      externalSeq: "MOCK-0003",
      productName: "테스트 건강기능식품",
      manufacturer: "(주)테스트헬스",
      barcode: undefined,
      reason: "기준규격 부적합 (비타민 함량 미달)",
      grade: "1등급",
      productType: "건강기능식품",
      foodTypeName: "비타민/무기질",
      packageUnit: "60정",
      manufacturedAt: "2026-03-15",
      expiryInfo: "24개월",
      recallMethod: "회수후 환불",
      imageUrls: [],
      manufacturerAddress: "부산광역시 해운대구 테스트로 3",
      manufacturerTel: "051-000-0000",
      licenseNo: "00000002",
      reportNo: "00000000002",
      registeredAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 5),
    },
  ];
}

async function fetchPage(
  key: string,
  startIdx: number,
  endIdx: number
): Promise<{ rows: I0490Row[]; total: number; errCode?: string; errMsg?: string }> {
  const url = `${BASE}/${key}/${SERVICE_CODE}/json/${startIdx}/${endIdx}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`I0490 HTTP ${res.status}`);
  }
  const json = (await res.json()) as I0490Response;
  const block = json.I0490;
  // RESULT가 최상위에 있는 경우(에러 응답)도 처리
  const code = block?.RESULT?.CODE ?? json.RESULT?.CODE;
  const msg = block?.RESULT?.MSG ?? json.RESULT?.MSG;
  // INFO-200 = 데이터 없음 (정상)
  if (code && code !== "INFO-000" && code !== "INFO-200") {
    return { rows: [], total: 0, errCode: code, errMsg: msg };
  }
  const rows = block?.row ?? [];
  const total = parseInt(block?.total_count ?? "0", 10) || 0;
  return { rows, total };
}

export async function fetchRecalls(opts?: {
  startIdx?: number;
  endIdx?: number;
}): Promise<RecallsFetchResult> {
  const key = loadKey();
  if (!key) {
    return {
      recalls: mockRecalls(),
      usedMock: true,
      total: 3,
      error: "KOREANNET_API_KEY 미설정 (mock 데이터 반환)",
    };
  }

  // 명시적 범위가 들어오면 그것만 호출, 아니면 페이지네이션 루프
  if (opts?.startIdx !== undefined && opts?.endIdx !== undefined) {
    try {
      const { rows, total, errCode, errMsg } = await fetchPage(
        key,
        opts.startIdx,
        opts.endIdx
      );
      if (errCode) {
        return {
          recalls: [],
          usedMock: false,
          total: 0,
          error: `I0490 ${errCode}: ${errMsg ?? ""}`,
        };
      }
      const items = rows
        .map(rowToItem)
        .filter((x): x is RecallItem => x !== null);
      return { recalls: items, usedMock: false, total };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { recalls: [], usedMock: false, total: 0, error: msg };
    }
  }

  // 페이지네이션 루프 (1~1000, 1001~2000, ...)
  const all: RecallItem[] = [];
  let start = 1;
  let totalCount = 0;
  let lastError: string | undefined;
  while (start <= MAX_RECORDS) {
    const end = Math.min(start + PAGE_SIZE - 1, MAX_RECORDS);
    try {
      const { rows, total, errCode, errMsg } = await fetchPage(key, start, end);
      if (errCode) {
        // 첫 페이지부터 에러면 fail, 중간이면 부분 결과 반환
        if (all.length === 0) {
          return {
            recalls: [],
            usedMock: false,
            total: 0,
            error: `I0490 ${errCode}: ${errMsg ?? ""}`,
          };
        }
        lastError = `${errCode}: ${errMsg ?? ""}`;
        break;
      }
      if (totalCount === 0) totalCount = total;
      const items = rows
        .map(rowToItem)
        .filter((x): x is RecallItem => x !== null);
      all.push(...items);
      // 마지막 페이지 판정: 반환 row가 페이지 사이즈보다 적거나 누적이 total 도달
      if (rows.length < PAGE_SIZE) break;
      if (totalCount > 0 && all.length >= totalCount) break;
      start = end + 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 첫 페이지 실패 시 mock fallback (kamis 패턴)
      if (all.length === 0) {
        return {
          recalls: mockRecalls(),
          usedMock: true,
          total: 3,
          error: msg,
        };
      }
      lastError = msg;
      break;
    }
  }

  return {
    recalls: all,
    usedMock: false,
    total: totalCount || all.length,
    error: lastError,
  };
}
