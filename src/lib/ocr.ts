// 영수증 OCR 모듈 — 우선순위 chain
// 1. CLOVA Receipt OCR (있으면 — 한국 영수증 정확도 최고, 자동 구조화 응답)
// 2. Google Cloud Vision OCR (있으면 — 자체 휴리스틱 파서로 품목/가격 추출)
// 3. Mock 데이터 (둘 다 없으면)

export type ParsedReceiptItem = {
  rawName: string;   // OCR이 읽은 원본 텍스트
  price: number;     // 원 단위
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
      items.push({ rawName: name, price, quantity: count });
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

  // 첫 줄(또는 처음 5줄 안)에서 마트 이름 찾기
  const STORE_KEYWORDS = [
    "롯데마트", "이마트", "홈플러스", "킴스클럽", "코스트코",
    "GS더프레시", "GS25", "CU", "세븐일레븐", "마트", "백화점",
  ];
  let storeHint: string | undefined;
  for (const l of lines.slice(0, 8)) {
    if (STORE_KEYWORDS.some((k) => l.includes(k))) {
      storeHint = l;
      break;
    }
  }
  if (!storeHint) {
    // 첫 줄이 짧고 한글 위주면 매장명 추정
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

  // 합계 찾기
  let totalAmount: number | undefined;
  const TOTAL_KEYWORDS = ["합계", "총", "TOTAL", "Total", "결제금액", "구매금액"];
  for (const l of lines) {
    if (TOTAL_KEYWORDS.some((k) => l.includes(k))) {
      const matches = [...l.matchAll(PRICE_RE)];
      if (matches.length > 0) {
        const last = matches[matches.length - 1][1];
        const n = parseInt(last.replace(/,/g, ""), 10);
        if (n > 0) {
          totalAmount = n;
          break;
        }
      }
    }
  }

  // 영수증 메타정보 키워드 — 품목이 아니므로 제외
  // (주소/연락처/카드정보/결제정보/광고문구 등)
  const META_KEYWORDS_FILTER = [
    "주소", "전화", "TEL", "Tel", "사업자",
    "카드번호", "카드사", "매입사", "가맹점", "발행",
    "사용금액", "할부", "승인", "응답", "거래일시",
    "매출", "부가세", "결제금액", "현금영수증", "신용카드",
    "포인트", "적립", "쿠폰",
    "버는법", "이벤트", "당첨", "응모",
    "교환/환불", "교환", "환불",
    "NO:", "NO :", "수량/금액", "고객용", "송장",
  ];

  // 카드번호 패턴 (4-4-4-4 또는 마스킹 *)
  const CARD_NUM_RE = /\d{4}[-\s]\d{2,4}[-*]+/;
  // 길이 큰 숫자만 (10자리+) — 승인번호/영수증번호 등
  const LARGE_NUM_RE = /^\D*\d{8,}\D*$/;

  // 품목 줄 추출 — 보수적으로
  const items: ParsedReceiptItem[] = [];
  for (const l of lines) {
    if (TOTAL_KEYWORDS.some((k) => l.includes(k))) continue;
    if (META_KEYWORDS_FILTER.some((k) => l.includes(k))) continue;
    if (storeHint && l === storeHint) continue;
    if (receiptDate && l.includes(receiptDate.replace(/-/g, "."))) continue;
    if (CARD_NUM_RE.test(l)) continue;
    if (LARGE_NUM_RE.test(l)) continue;
    // 한글 글자가 2자 이상 들어있어야 (한글 없는 라인은 메타정보일 가능성 ↑)
    const hangul = l.match(/[가-힣]/g)?.length ?? 0;
    if (hangul < 2) continue;

    // 가격 매칭
    const matches = [...l.matchAll(PRICE_RE)];
    if (matches.length === 0) continue;

    const lastMatch = matches[matches.length - 1];
    const priceStr = lastMatch[1];
    const price = parseInt(priceStr.replace(/,/g, ""), 10);
    // 가격 sanity — 마트 영수증 SKU는 보통 100~200,000원
    if (!price || price < 100 || price > 200_000) continue;

    // 품목명 추출
    let name = l.replace(lastMatch[0], "").trim();
    name = name.replace(/^\d+\s+/, "");
    name = name.replace(/\s+x?\s*\d+$/i, "");
    name = name.replace(/[*#]+$/, "").trim();
    // 한글 핵심 토큰 추출 — 영문/숫자만 남으면 메타정보
    const nameHangul = name.match(/[가-힣]/g)?.length ?? 0;
    if (nameHangul < 2) continue;
    if (name.length < 2) continue;

    items.push({ rawName: name, price, quantity: 1 });
  }

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
        { rawName: "신라면 5입", price: 4480, quantity: 1 },
        { rawName: "서울우유 1L", price: 2890, quantity: 2 },
        { rawName: "햇반 12입", price: 13800, quantity: 1 },
        { rawName: "삼다수 2L 6입", price: 6980, quantity: 1 },
      ],
      totalAmount: 4480 + 2890 * 2 + 13800 + 6980,
      rawText: "[Mock OCR] 롯데마트 잠실점 영수증",
    },
    {
      storeHint: "이마트 성수점",
      receiptDate: new Date().toISOString().slice(0, 10),
      items: [
        { rawName: "진라면 매운맛 5입", price: 3480, quantity: 1 },
        { rawName: "매일 저지방우유", price: 2580, quantity: 1 },
        { rawName: "동원참치 살코기 3캔", price: 5580, quantity: 1 },
        { rawName: "계란 30구", price: 8580, quantity: 1 },
      ],
      totalAmount: 3480 + 2580 + 5580 + 8580,
      rawText: "[Mock OCR] 이마트 성수점 영수증",
    },
    {
      storeHint: "홈플러스 잠실점",
      receiptDate: new Date().toISOString().slice(0, 10),
      items: [
        { rawName: "스팸 200g 4개", price: 12300, quantity: 1 },
        { rawName: "찌개두부 300g", price: 2280, quantity: 2 },
        { rawName: "코카콜라 1.5", price: 2880, quantity: 1 },
      ],
      totalAmount: 12300 + 2280 * 2 + 2880,
      rawText: "[Mock OCR] 홈플러스 잠실점 영수증",
    },
  ];
  return samples[Math.floor(Math.random() * samples.length)];
}

export type OcrSource = "clova" | "google_vision" | "mock";

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
