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
// 응답 구조:
//   { images: [{ inferText?, fields?: [{ inferText, boundingPoly... }] }] }
function extractClovaPlainText(json: unknown): string {
  type Field = { inferText?: string; lineBreak?: boolean };
  type Image = { inferText?: string; fields?: Field[] };
  type Resp = { images?: Image[] };

  const r = json as Resp;
  const img = r?.images?.[0];
  if (!img) return "";

  // inferText가 있으면 그대로
  if (img.inferText && img.inferText.trim()) return img.inferText;

  // 없으면 fields[]를 줄 단위로 합침
  if (Array.isArray(img.fields)) {
    const lines: string[] = [];
    let current = "";
    for (const f of img.fields) {
      const t = (f.inferText ?? "").trim();
      if (!t) continue;
      current = current ? `${current} ${t}` : t;
      if (f.lineBreak) {
        lines.push(current);
        current = "";
      }
    }
    if (current) lines.push(current);
    return lines.join("\n");
  }

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

  // 품목 줄 추출
  // 휴리스틱: 한 줄에 한국어/영문 텍스트 + 가격 패턴이 함께 있고, "합계"/"총" 키워드 없으면 품목으로 간주
  const items: ParsedReceiptItem[] = [];
  for (const l of lines) {
    if (TOTAL_KEYWORDS.some((k) => l.includes(k))) continue;
    if (storeHint && l === storeHint) continue;
    if (receiptDate && l.includes(receiptDate.replace(/-/g, "."))) continue;

    // 가격 매칭
    const matches = [...l.matchAll(PRICE_RE)];
    if (matches.length === 0) continue;

    // 줄 끝 가격 (가장 오른쪽) 우선
    const lastMatch = matches[matches.length - 1];
    const priceStr = lastMatch[1];
    const price = parseInt(priceStr.replace(/,/g, ""), 10);
    if (!price || price < 100 || price > 10_000_000) continue;

    // 품목명: 줄에서 가격 부분 제거 + 좌우 trim
    let name = l.replace(lastMatch[0], "").trim();
    // 흔히 있는 잡음 제거
    name = name.replace(/^\d+\s+/, ""); // 앞쪽 일련번호
    name = name.replace(/\s+x?\s*\d+$/i, ""); // "x 1" 같은 수량 제거
    name = name.replace(/[*#]+$/, "").trim();
    if (name.length < 2) continue;
    if (/^\d+$/.test(name)) continue; // 숫자만은 패스
    // 너무 짧고 가격만 있는 줄 (예: "포인트 100") 같은 잡음 필터
    if (name.length < 3 && !/[가-힣]/.test(name)) continue;

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
  let lastError: string | null = null;

  // 1순위: CLOVA Receipt OCR
  const hasClova = !!process.env.CLOVA_OCR_URL && !!process.env.CLOVA_OCR_SECRET;
  if (hasClova && imageBase64) {
    try {
      const receipt = await callClovaOcr(imageBase64);
      if (receipt.items.length > 0 || receipt.storeHint) {
        return { receipt, usedMock: false, source: "clova" };
      }
      lastError = "CLOVA가 글씨를 인식하지 못했습니다.";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[OCR] CLOVA 실패:", msg);
      lastError = `CLOVA OCR 호출 실패: ${msg.slice(0, 100)}`;
    }
  }

  // 2순위: Google Vision
  const hasVision = !!process.env.GOOGLE_VISION_API_KEY;
  if (hasVision && imageBase64) {
    try {
      const receipt = await callGoogleVision(imageBase64);
      if (receipt.items.length > 0 || receipt.storeHint) {
        return { receipt, usedMock: false, source: "google_vision" };
      }
      lastError = "Vision OCR이 글씨를 인식하지 못했습니다.";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[OCR] Vision 실패:", msg);
      lastError = `Vision OCR 호출 실패: ${msg.slice(0, 100)}`;
    }
  }

  // 이미지가 있는데 OCR 다 실패한 경우 — mock 노이즈 대신 명확한 에러로
  // (demo용 mock은 imageBase64가 null인 흐름에만 사용)
  if (imageBase64) {
    throw new Error(
      lastError ??
        "OCR 서비스가 설정되지 않았습니다. 영수증 사진 처리에 실패했습니다."
    );
  }

  // 이미지 없는 demo 흐름만 mock
  return { receipt: mockOcr(), usedMock: true, source: "mock" };
}
