// 영수증 OCR 모듈 — 우선순위 chain
// 1. CLOVA Receipt OCR (있으면 — 한국 영수증 정확도 최고, 자동 구조화 응답)
// 2. Google Cloud Vision OCR (있으면 — 자체 휴리스틱 파서로 품목/가격 추출)
// 3. Mock 데이터 (둘 다 없으면)

export type ParsedReceiptItem = {
  rawName: string;          // OCR이 읽은 원본 텍스트
  listPrice: number;        // 정가/단가 — 항상 채움
  paidPrice?: number;       // 행사/할인 적용 후 단가 — 없으면 정가 결제
  promotionType?: string;   // "할인" | "1+1" | "2+1" 등
  barcode?: string;         // EAN-13 등 GTIN — 다음 줄에 바코드 출력되는 영수증(킴스클럽 등)
  quantity: number;
};

export type ParsedReceipt = {
  storeHint?: string; // OCR이 추측한 마트 이름
  items: ParsedReceiptItem[];
  totalAmount?: number;
  receiptDate?: string;
  rawText: string;
};

// CLOVA OCR — Receipt 도메인이면 구조화된 응답, General/Custom이면 텍스트 추출
// Domain 종류와 무관하게 작동하도록 chain 처리
async function callClovaOcr(imageBase64: string): Promise<ParsedReceipt> {
  let url = process.env.CLOVA_OCR_URL;
  const secret = process.env.CLOVA_OCR_SECRET;
  if (!url || !secret) {
    throw new Error("CLOVA OCR 환경변수가 설정되지 않음");
  }
  // http 받았으면 https로 강제 (NCP 스펙은 https)
  url = url.replace(/^http:\/\//i, "https://");

  const body = {
    version: "V2",
    requestId: crypto.randomUUID(),
    timestamp: Date.now(),
    images: [
      {
        format: "jpg",
        name: "receipt",
        data: imageBase64,
      },
    ],
  };

  // 30초 timeout — CLOVA가 hang해도 client가 무한 대기하지 않도록
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OCR-SECRET": secret,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`CLOVA OCR ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = await res.json();

  // 1순위: Receipt OCR 구조화된 응답이 있으면 그걸로
  const structured = parseClovaResponse(json);
  if (structured.items.length > 0 || structured.storeHint) {
    return structured;
  }

  // 2순위: General/Custom OCR — fields[] 또는 inferText에서 텍스트 합쳐서 휴리스틱 파서
  const fullText = extractClovaPlainText(json);
  if (fullText.trim()) {
    return parseReceiptText(fullText);
  }

  return { items: [], rawText: JSON.stringify(json).slice(0, 300) };
}

// CLOVA General/Custom OCR 응답에서 평문 텍스트 추출
// 영수증은 column layout (품목명 | 수량 | 가격)이라 lineBreak 기반 합치기는
// column별로 끊겨버림. y좌표 기반 row 그룹화로 시각적 같은 행을 합침.
function extractClovaPlainText(json: unknown): string {
  type Vertex = { x?: number; y?: number };
  type Field = {
    inferText?: string;
    lineBreak?: boolean;
    boundingPoly?: { vertices?: Vertex[] };
  };
  type Image = { inferText?: string; fields?: Field[] };
  type Resp = { images?: Image[] };

  const r = json as Resp;
  const img = r?.images?.[0];
  if (!img) return "";

  // fields[]에 boundingPoly 있으면 y좌표 기반 row 그룹화 (영수증 layout 정확)
  if (Array.isArray(img.fields) && img.fields.length > 0) {
    type RowEntry = { text: string; yMid: number; xMin: number };
    const entries: RowEntry[] = [];
    for (const f of img.fields) {
      const t = (f.inferText ?? "").trim();
      if (!t) continue;
      const verts = f.boundingPoly?.vertices ?? [];
      const ys = verts.map((v) => v.y ?? 0);
      const xs = verts.map((v) => v.x ?? 0);
      const yMid = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
      const xMin = xs.length ? Math.min(...xs) : 0;
      entries.push({ text: t, yMid, xMin });
    }

    if (entries.length === 0) {
      return img.inferText?.trim() ?? "";
    }

    // y좌표 작은 순(위→아래) 정렬, 비슷한 y는 같은 row로 묶기
    entries.sort((a, b) => a.yMid - b.yMid);
    const ROW_TOLERANCE = 12; // 영수증 글씨 12px 이내면 같은 row
    type Row = { yMid: number; items: RowEntry[] };
    const rows: Row[] = [];
    for (const e of entries) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(e.yMid - last.yMid) <= ROW_TOLERANCE) {
        last.items.push(e);
        last.yMid =
          last.items.reduce((s, x) => s + x.yMid, 0) / last.items.length;
      } else {
        rows.push({ yMid: e.yMid, items: [e] });
      }
    }

    // 각 row 안에서 x 좌측→우측 정렬 후 합침
    return rows
      .map((row) =>
        row.items
          .sort((a, b) => a.xMin - b.xMin)
          .map((x) => x.text)
          .join(" ")
      )
      .join("\n");
  }

  // boundingPoly 없으면 inferText fallback
  if (img.inferText && img.inferText.trim()) return img.inferText;
  return "";
}

// CLOVA Receipt OCR 응답 파서
// 실제 응답 스펙: https://api.ncloud-docs.com/docs/ai-application-service-ocr-receipt
// 응답 형태:
// { images: [{ receipt: { result: { storeInfo, paymentInfo, subResults[].items[], totalPrice } } }] }
function parseClovaResponse(json: unknown): ParsedReceipt {
  type ClovaText = { text?: string; formatted?: { value?: string } };
  type ClovaItem = {
    name?: ClovaText;
    count?: ClovaText;
    price?: { price?: ClovaText };
  };
  type ClovaSub = { items?: ClovaItem[] };
  type ClovaReceipt = {
    storeInfo?: { name?: ClovaText };
    paymentInfo?: { date?: ClovaText };
    subResults?: ClovaSub[];
    totalPrice?: { price?: ClovaText };
  };
  type ClovaResp = {
    images?: Array<{ receipt?: { result?: ClovaReceipt }; inferText?: string }>;
  };

  const resp = json as ClovaResp;
  const img = resp?.images?.[0];
  const result = img?.receipt?.result;

  const textOf = (t?: ClovaText) =>
    t?.formatted?.value ?? t?.text ?? "";
  const numOf = (t?: ClovaText) => {
    const s = textOf(t).replace(/[^\d]/g, "");
    return s ? parseInt(s, 10) : 0;
  };

  const items: ParsedReceiptItem[] = [];
  for (const sub of result?.subResults ?? []) {
    for (const it of sub.items ?? []) {
      const name = textOf(it.name).trim();
      const price = numOf(it.price?.price);
      const count = numOf(it.count) || 1;
      if (!name || price <= 0) continue;
      items.push({ rawName: name, listPrice: price, quantity: count });
    }
  }

  return {
    storeHint: textOf(result?.storeInfo?.name).trim() || undefined,
    items,
    totalAmount: numOf(result?.totalPrice?.price) || undefined,
    receiptDate: textOf(result?.paymentInfo?.date).trim() || undefined,
    rawText: img?.inferText?.slice(0, 1000) ?? JSON.stringify(json).slice(0, 500),
  };
}

// Google Cloud Vision OCR — 일반 텍스트 추출 후 휴리스틱 파서로 품목/가격 매핑
async function callGoogleVision(imageBase64: string): Promise<ParsedReceipt> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_VISION_API_KEY 미설정");

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
  const body = {
    requests: [
      {
        image: { content: imageBase64 },
        features: [{ type: "TEXT_DETECTION", maxResults: 1 }],
        imageContext: { languageHints: ["ko", "en"] },
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Google Vision ${res.status}: ${txt.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    responses?: Array<{
      fullTextAnnotation?: { text?: string };
      error?: { message?: string };
    }>;
  };

  const r = json.responses?.[0];
  if (r?.error) throw new Error(`Vision: ${r.error.message}`);
  const fullText = r?.fullTextAnnotation?.text ?? "";
  if (!fullText.trim()) {
    return { items: [], rawText: "[Vision] 빈 응답" };
  }
  return parseReceiptText(fullText);
}

// ────────────────────────────────────────────────────────
// 영수증 라인 분류 — Phase 2: 바코드/할인/행사를 직전 상품에 묶기 위한 스캐너
// ────────────────────────────────────────────────────────

// EAN-13(국내 880xxx 포함), EAN-8, ITF-14, UPC-12 — 바코드 단독 라인 인식
// OCR row 그룹화에서 바코드만 따로 떨어지는 경우(킴스클럽 영수증 등)를 노림.
// 라인이 거의 숫자만 있고 길이 8/12/13/14 중 하나면 바코드로 본다.
const BARCODE_RE = /^\s*(\d{8}|\d{12}|\d{13}|\d{14})\s*$/;

// 가격 패턴 — 1,000원 / 1000 / 12,800원
const PRICE_RE_GLOBAL = /([1-9]\d{0,2}(?:,\d{3})+|\d{3,7})\s*원?/g;

// 할인 라인 패턴들 (한국 마트/편의점 사례 기반)
// 패턴 A: 킴스클럽 — "(할인 -11,820 ) 7,980" (음수 할인액 + 할인 후 결과가)
const DISCOUNT_PAREN_RE = /\(\s*할인\s*-\s*([1-9]\d{0,2}(?:,\d{3})+|\d{3,7})\s*\)/;
// 패턴 B: 롯데마트 — "[번들] 50% -1,645", "[L_할인] 3000원 -3,000", "[할인쿠폰] 20% -3,980"
const DISCOUNT_BRACKET_RE = /\[\s*([^\]]*?(?:할인|쿠폰|번들|행사|이벤트)[^\]]*?)\s*\]/;
// 음수 할인 금액(라인에서 마지막 음수 가격)
const NEG_AMOUNT_RE = /-\s*([1-9]\d{0,2}(?:,\d{3})+|\d{3,7})/g;
// 할인 라벨 안의 % 또는 정액 추출
const PERCENT_RE = /(\d{1,3})\s*%/;
const FIXED_AMOUNT_RE = /(\d{1,3}(?:,\d{3})+|\d{3,7})\s*원/;

type DiscountInfo = {
  amount?: number;          // 절대값 (예: 11820, 1645)
  afterPrice?: number;      // 할인 후 결과가 (있으면, 예: 킴스클럽 7,980)
  promotionType?: string;   // "할인", "번들 50%", "쿠폰 20%", "할인 3,000원" 등
};

// 라인이 할인 라인인지 판별 + 할인 정보 추출
// 반환: null이면 할인 라인 아님
function parseDiscountLine(line: string): DiscountInfo | null {
  // 패턴 A: (할인 -11,820)
  const parenMatch = line.match(DISCOUNT_PAREN_RE);
  if (parenMatch) {
    const amount = parseInt(parenMatch[1].replace(/,/g, ""), 10);
    // 라인에 있는 모든 양수 가격 중 마지막 = 할인 후 결과가일 가능성
    const allPrices = [...line.matchAll(PRICE_RE_GLOBAL)]
      .map((m) => parseInt(m[1].replace(/,/g, ""), 10))
      .filter((n) => n > 0 && n < 10_000_000);
    // 할인액 외의 마지막 가격 → 결과가
    const afterPrice = allPrices.filter((n) => n !== amount).slice(-1)[0];
    return { amount, afterPrice, promotionType: "할인" };
  }

  // 패턴 B: [번들] 50%, [L_할인] 3000원, [할인쿠폰] 20%
  const bracketMatch = line.match(DISCOUNT_BRACKET_RE);
  if (bracketMatch) {
    const label = bracketMatch[1].replace(/_/g, " ").trim();
    const negMatches = [...line.matchAll(NEG_AMOUNT_RE)];
    const amount = negMatches.length
      ? parseInt(negMatches[negMatches.length - 1][1].replace(/,/g, ""), 10)
      : undefined;
    // 라벨에서 비율/정액 보강
    const pct = line.match(PERCENT_RE)?.[1];
    const fixed = line.match(FIXED_AMOUNT_RE)?.[1]?.replace(/,/g, "");
    let promo = label.replace(/^L\s*/i, "").trim(); // "L 할인" → "할인"
    if (pct) promo = `${promo} ${pct}%`;
    else if (fixed) promo = `${promo} ${parseInt(fixed, 10).toLocaleString()}원`;
    return { amount, promotionType: promo };
  }

  return null;
}

// 영수증 텍스트 → 구조화된 ParsedReceipt 휴리스틱 파서
// 한국 영수증의 일반적 형태:
//   매장명 (보통 첫 줄 또는 큰 글씨)
//   날짜
//   "품목명     수량 가격" 또는 "품목명\n수량 가격"
//   "합계", "총", "TOTAL" 줄에 합계
function parseReceiptText(text: string): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // 가격 패턴 — 1,000원 / 1000 / 12,800원 / 12,800
  // 영수증에서 의미있는 가격은 보통 100원 이상
  const PRICE_RE = /([1-9]\d{0,2}(?:,\d{3})+|\d{3,7})\s*원?/g;

  // 첫 줄(또는 처음 8줄 안)에서 마트 이름 찾기
  // GS25 같은 특정 chain은 보통 캐치프레이즈("재미있는 일상 플랫폼") 옆에 같이 나옴 →
  // 그 라인 통째로 쓰면 "재미있는 일상 플랫폼 GS25"가 매장명이 됨. 다음 라인에서 더
  // 구체적인 매장명("GS25힐데스하임점")이 나오는 경우가 많아서 그걸 우선.
  const STORE_KEYWORDS = [
    "롯데마트", "이마트", "홈플러스", "킴스클럽", "코스트코",
    "GS더프레시", "GS25", "CU", "세븐일레븐", "마트", "백화점",
  ];
  const SLOGAN_KEYWORDS = [
    "재미있는", "행복한", "즐거운", "신선한", "감사", "환영",
    "플랫폼", "라이프스타일",
  ];
  const isSlogan = (line: string) =>
    SLOGAN_KEYWORDS.some((k) => line.includes(k));

  let storeHint: string | undefined;
  // 1순위: store keyword + slogan 아닌 짧은 라인 (지점명까지 포함된 라인)
  for (const l of lines.slice(0, 8)) {
    if (STORE_KEYWORDS.some((k) => l.includes(k)) && !isSlogan(l) && l.length <= 25) {
      storeHint = l;
      break;
    }
  }
  // 2순위: store keyword 포함된 모든 라인
  if (!storeHint) {
    for (const l of lines.slice(0, 8)) {
      if (STORE_KEYWORDS.some((k) => l.includes(k))) {
        // 슬로건이면 keyword만 추출
        if (isSlogan(l)) {
          const found = STORE_KEYWORDS.find((k) => l.includes(k));
          storeHint = found;
        } else {
          storeHint = l;
        }
        break;
      }
    }
  }
  // 3순위: 첫 줄이 짧고 한글 위주면 매장명 추정
  if (!storeHint) {
    const first = lines[0];
    if (first && first.length <= 20 && /[가-힣]/.test(first)) storeHint = first;
  }

  // 날짜 찾기 — YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD
  let receiptDate: string | undefined;
  for (const l of lines) {
    const m = l.match(/(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
    if (m) {
      const y = m[1];
      const mm = m[2].padStart(2, "0");
      const dd = m[3].padStart(2, "0");
      receiptDate = `${y}-${mm}-${dd}`;
      break;
    }
  }

  // 합계 찾기 — 우선순위 기반으로 "결제 후 실제 금액"을 잡음
  // (영수증마다 "총계 = 단가 합" / "품목할인계 = 할인 합" / "합계 = 결제 합" 의미가 뒤섞임)
  // 공백 무시 매칭 — CLOVA가 "합 계" 분리해 보낼 수 있음
  // 우선순위: 결제금액 > 신용카드 > 청구액 > 현금영수증 > 합계 > 구매금액
  // ("총계"는 단가 합이라 후보 제외 — 품목 라인 컷용으로만 사용)
  const TOTAL_KEYWORDS_BY_PRIORITY = [
    "결제금액",
    "신용카드", "체크카드",
    "청구액",
    "현금영수증",
    "합계",
    "구매금액",
    "TOTAL",
  ];
  // "총계", "할인계" 등은 합계 라인 컷용 — 품목 추출 루프가 이 라인들을 품목으로 잘못 잡지 않게.
  const TOTAL_KEYWORDS_FOR_LINE_CUT = [
    ...TOTAL_KEYWORDS_BY_PRIORITY,
    "총계",          // 단가 합 (할인 전)
    "할인계", "할인합계",
    "자사할인", "에누리",
    "물품가액", "공급가액",
  ];
  // 합계 후보에서 제외할 라인 키워드 — 면세/과세/부가세, 할인 합계 라인 등
  const TOTAL_EXCLUDE = [
    "할인계", "할인합계",
    "자사할인", "에누리",
    "면세", "과세", "부가세",
    "물품가액", "공급가액",
    "총계",   // 단가 합 — 결제 합계 아님
  ];
  const noSpaceOf = (s: string) => s.replace(/\s/g, "");
  const containsAny = (line: string, keywords: string[]) => {
    const ns = noSpaceOf(line);
    return keywords.some((k) => ns.includes(noSpaceOf(k)));
  };
  // 품목 라인 컷용 (기존 호환 유지)
  const containsTotal = (line: string) => containsAny(line, TOTAL_KEYWORDS_FOR_LINE_CUT);

  let totalAmount: number | undefined;
  outer: for (const k of TOTAL_KEYWORDS_BY_PRIORITY) {
    for (const l of lines) {
      if (!noSpaceOf(l).includes(noSpaceOf(k))) continue;
      if (containsAny(l, TOTAL_EXCLUDE)) continue;
      const matches = [...l.matchAll(PRICE_RE)];
      if (matches.length === 0) continue;
      const last = matches[matches.length - 1][1];
      const n = parseInt(last.replace(/,/g, ""), 10);
      // sanity — 결제금액이 100원 미만이거나 1억 이상이면 의심
      if (n >= 100 && n < 100_000_000) {
        totalAmount = n;
        break outer;
      }
    }
  }

  // 영수증 메타정보 키워드 — 품목이 아니므로 제외
  // (주소/연락처/카드정보/결제정보/광고문구 등)
  const META_KEYWORDS_FILTER = [
    "주소", "전화", "TEL", "Tel", "사업자",
    "카드번호", "카드사", "매입사", "가맹점", "발행",
    "사용금액", "할부", "승인", "응답", "거래일시",
    "매출", "부가세", "결제금액", "현금영수증",
    "포인트", "적립", "쿠폰",
    "버는법", "이벤트", "당첨", "응모",
    "교환/환불", "교환", "환불",
    "할인", "행사할인", "쿠폰할인", "회원할인", "즉시할인",
    "식별번호", "회원번호", "회원NO", "회원 NO", "거래번호",
    "NO:", "NO :", "수량/금액", "고객용", "송장",
    // 영수증 헤더 (구매자 표시)
    "외 1명", "외 2명", "외 3명", "외 4명", "외 5명",
    // 결제 수단
    "신용", "체크", "현금", "GSPAY", "삼성페이", "카카오페이", "네이버페이",
    // 행정구역 (주소 라인)
    "동", "구", "시", "도", // "서울/강동구/천호동" 같은 행정구역
  ];

  // 행정구역 키워드는 너무 흔해서 단독으로 쓰면 over-filter — 주소 패턴(번지 포함)일 때만
  const ADDRESS_RE = /\d+\s*-\s*\d+\s*번지|\d+\s*번지|\d+\s*번길/;

  // 카드번호 패턴 (4-4-4-4 또는 마스킹 *)
  const CARD_NUM_RE = /\d{4}[-\s]\d{2,4}[-*]+/;
  // 길이 큰 숫자만 (10자리+) — 승인번호/영수증번호 등
  const LARGE_NUM_RE = /^\D*\d{8,}\D*$/;
  // 마스킹된 개인정보 — 글자 사이 *(김*진남) 또는 다중 *(***117*, 8710****370*)
  // 단, 라인 맨 앞 단일 *는 면세 표시(롯데마트 "*호주산 홍두깨")이므로 제외
  const MASKED_PII_RE = /[가-힣A-Za-z\d]\*[가-힣A-Za-z\d]|\*{2,}/;
  // "홍길동님:" 같은 고객명 라인
  const CUSTOMER_NAME_RE = /[가-힣*]{2,}\s*(님|고객|회원)\s*[:：]/;
  // "(할인 -11,820)" 처럼 음수 가격이 들어간 라인 — 할인/환불
  const NEGATIVE_PRICE_RE = /-\s*[1-9]\d{0,2}(?:,\d{3})+/;
  // 콤마 포함된 가격(이름에서 제거할 때 사용) — "콤비네이션 피자 415G 9,900" → 단가 9,900 제거
  const COMMA_PRICE_RE = /[1-9]\d{0,2}(?:,\d{3})+\s*원?/g;

  // ────────────────────────────────────────────────────────
  // 품목 추출 — 2단계 스캐너 + 그룹 빌더
  // 1단계: 각 라인을 product/barcode/discount/ignore로 분류
  // 2단계: product 등장 시 새 그룹 시작 → 후속 barcode/discount를 직전 그룹에 묶음
  //         (paidPrice = 할인 적용 후 단가, promotionType = 행사 라벨)
  // ────────────────────────────────────────────────────────
  type ScannedLine =
    | { kind: "product"; rawName: string; listPrice: number; quantity: number }
    | { kind: "barcode"; barcode: string }
    | { kind: "discount"; info: DiscountInfo }
    | { kind: "ignore" };

  const scanned: ScannedLine[] = lines.map((l): ScannedLine => {
    // 우선순위 1: 할인 라인은 META 키워드("할인") 컷보다 먼저 잡아야 직전 상품에 묶을 수 있음
    const disc = parseDiscountLine(l);
    if (disc) return { kind: "discount", info: disc };

    // 우선순위 2: 바코드 단독 라인 (LARGE_NUM_RE보다 먼저)
    const bm = l.match(BARCODE_RE);
    if (bm) return { kind: "barcode", barcode: bm[1] };

    // 그 외 일반 메타/필터들
    if (containsTotal(l)) return { kind: "ignore" };
    if (META_KEYWORDS_FILTER.some((k) => l.includes(k))) return { kind: "ignore" };
    if (storeHint && l === storeHint) return { kind: "ignore" };
    if (receiptDate && l.includes(receiptDate.replace(/-/g, "."))) return { kind: "ignore" };
    if (CARD_NUM_RE.test(l)) return { kind: "ignore" };
    if (LARGE_NUM_RE.test(l)) return { kind: "ignore" };
    if (ADDRESS_RE.test(l)) return { kind: "ignore" };
    if (MASKED_PII_RE.test(l)) return { kind: "ignore" };
    if (CUSTOMER_NAME_RE.test(l)) return { kind: "ignore" };
    if (NEGATIVE_PRICE_RE.test(l)) return { kind: "ignore" }; // discount로 못 잡힌 음수 라인

    const hangul = l.match(/[가-힣]/g)?.length ?? 0;
    if (hangul < 2) return { kind: "ignore" };

    const matches = [...l.matchAll(PRICE_RE)];
    if (matches.length === 0) return { kind: "ignore" };

    const lastMatch = matches[matches.length - 1];
    const listPrice = parseInt(lastMatch[1].replace(/,/g, ""), 10);
    if (!listPrice || listPrice < 100 || listPrice > 200_000) return { kind: "ignore" };

    // 품목명 추출
    let name = l.replace(lastMatch[0], "").trim();
    name = name.replace(COMMA_PRICE_RE, " ");
    name = name.replace(/^\d+\s+/, "");
    name = name.replace(/\s+x?\s*\d+$/i, "");
    name = name.replace(/^[*#]+|[*#]+$/g, "").trim();
    name = name.replace(/\s+/g, " ").trim();
    const nameHangul = name.match(/[가-힣]/g)?.length ?? 0;
    if (nameHangul < 2) return { kind: "ignore" };
    if (name.length < 2) return { kind: "ignore" };

    return { kind: "product", rawName: name, listPrice, quantity: 1 };
  });

  // 2단계: 그룹 빌딩
  const items: ParsedReceiptItem[] = [];
  let cur: ParsedReceiptItem | null = null;
  for (const s of scanned) {
    if (s.kind === "product") {
      if (cur) items.push(cur);
      cur = {
        rawName: s.rawName,
        listPrice: s.listPrice,
        quantity: s.quantity,
      };
    } else if (s.kind === "barcode" && cur) {
      cur.barcode = s.barcode;
    } else if (s.kind === "discount" && cur) {
      // 1) 결과가가 명시되면 그대로 (단가화: 영수증 결과가는 보통 합계)
      // 2) 아니면 할인액으로 계산 — 단가 × 수량 - 할인액 → 단가
      if (s.info.afterPrice != null && cur.quantity > 0) {
        cur.paidPrice = Math.round(s.info.afterPrice / cur.quantity);
      } else if (s.info.amount != null && cur.quantity > 0) {
        const totalBefore = cur.listPrice * cur.quantity;
        const totalAfter = totalBefore - s.info.amount;
        if (totalAfter > 0) cur.paidPrice = Math.round(totalAfter / cur.quantity);
      }
      if (s.info.promotionType) cur.promotionType = s.info.promotionType;
    }
    // ignore는 그룹에 영향 없음
  }
  if (cur) items.push(cur);

  return {
    storeHint,
    receiptDate,
    totalAmount,
    items,
    rawText: text.slice(0, 1500),
  };
}

// Mock OCR: 데모용으로 가짜 영수증을 그럴듯하게 반환
function mockOcr(): ParsedReceipt {
  const samples: ParsedReceipt[] = [
    {
      storeHint: "롯데마트 잠실점",
      receiptDate: new Date().toISOString().slice(0, 10),
      items: [
        { rawName: "신라면 5입", listPrice: 4480, quantity: 1 },
        { rawName: "서울우유 1L", listPrice: 2890, quantity: 2 },
        { rawName: "햇반 12입", listPrice: 13800, quantity: 1 },
        { rawName: "삼다수 2L 6입", listPrice: 6980, quantity: 1 },
      ],
      totalAmount: 4480 + 2890 * 2 + 13800 + 6980,
      rawText: "[Mock OCR] 롯데마트 잠실점 영수증",
    },
    {
      storeHint: "이마트 성수점",
      receiptDate: new Date().toISOString().slice(0, 10),
      items: [
        { rawName: "진라면 매운맛 5입", listPrice: 3480, quantity: 1 },
        { rawName: "매일 저지방우유", listPrice: 2580, quantity: 1 },
        { rawName: "동원참치 살코기 3캔", listPrice: 5580, quantity: 1 },
        { rawName: "계란 30구", listPrice: 8580, quantity: 1 },
      ],
      totalAmount: 3480 + 2580 + 5580 + 8580,
      rawText: "[Mock OCR] 이마트 성수점 영수증",
    },
    {
      storeHint: "홈플러스 잠실점",
      receiptDate: new Date().toISOString().slice(0, 10),
      items: [
        { rawName: "스팸 200g 4개", listPrice: 12300, quantity: 1 },
        { rawName: "찌개두부 300g", listPrice: 2280, quantity: 2 },
        { rawName: "코카콜라 1.5", listPrice: 2880, quantity: 1 },
      ],
      totalAmount: 12300 + 2280 * 2 + 2880,
      rawText: "[Mock OCR] 홈플러스 잠실점 영수증",
    },
  ];
  return samples[Math.floor(Math.random() * samples.length)];
}

export type OcrSource = "clova" | "google_vision" | "mock";

// 여러 ParsedReceipt를 하나로 합침 (긴 영수증 이어찍기)
// - storeHint/receiptDate/totalAmount는 가장 먼저 발견된 값 우선
// - items는 합치되 (rawName, price) 중복 제거
export function mergeReceipts(receipts: ParsedReceipt[]): ParsedReceipt {
  const out: ParsedReceipt = {
    storeHint: undefined,
    receiptDate: undefined,
    totalAmount: undefined,
    items: [],
    rawText: "",
  };
  const seen = new Set<string>();
  const rawTexts: string[] = [];
  for (const r of receipts) {
    if (!out.storeHint && r.storeHint) out.storeHint = r.storeHint;
    if (!out.receiptDate && r.receiptDate) out.receiptDate = r.receiptDate;
    if (!out.totalAmount && r.totalAmount) out.totalAmount = r.totalAmount;
    for (const it of r.items) {
      const key = `${it.rawName}|${it.listPrice}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.items.push(it);
    }
    if (r.rawText) rawTexts.push(r.rawText);
  }
  out.rawText = rawTexts.join("\n---\n").slice(0, 3000);
  return out;
}

export async function parseReceipt(
  imageBase64: string | null
): Promise<{ receipt: ParsedReceipt; usedMock: boolean; source: OcrSource }> {
  // 각 OCR의 실패 사유를 따로 보관 → 마지막에 종합해서 사용자에게
  let clovaError: string | null = null;
  let visionError: string | null = null;

  // 1순위: CLOVA Receipt OCR
  const hasClova = !!process.env.CLOVA_OCR_URL && !!process.env.CLOVA_OCR_SECRET;
  if (hasClova && imageBase64) {
    try {
      const receipt = await callClovaOcr(imageBase64);
      if (receipt.items.length > 0 || receipt.storeHint) {
        return { receipt, usedMock: false, source: "clova" };
      }
      clovaError = "CLOVA가 글씨를 인식하지 못했습니다.";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[OCR] CLOVA 실패:", msg);
      clovaError = `CLOVA: ${msg.slice(0, 200)}`;
    }
  } else if (!hasClova) {
    clovaError = "CLOVA 환경변수 미설정";
  }

  // 2순위: Google Vision
  const hasVision = !!process.env.GOOGLE_VISION_API_KEY;
  if (hasVision && imageBase64) {
    try {
      const receipt = await callGoogleVision(imageBase64);
      if (receipt.items.length > 0 || receipt.storeHint) {
        return { receipt, usedMock: false, source: "google_vision" };
      }
      visionError = "Vision이 글씨를 인식하지 못했습니다.";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[OCR] Vision 실패:", msg);
      visionError = `Vision: ${msg.slice(0, 200)}`;
    }
  } else if (!hasVision) {
    visionError = "Vision 환경변수 미설정";
  }

  // 이미지가 있는데 OCR 다 실패 → 두 에러 모두 표시
  if (imageBase64) {
    const parts: string[] = [];
    if (clovaError) parts.push(clovaError);
    if (visionError) parts.push(visionError);
    throw new Error(parts.join("\n\n"));
  }

  // demo 흐름만 mock
  return { receipt: mockOcr(), usedMock: true, source: "mock" };
}
