// 영수증 OCR 모듈
// - 환경변수 CLOVA_OCR_URL/SECRET이 설정되면 실제 CLOVA OCR 호출
// - 없으면 mock 데이터 반환 (개발/데모용)

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

// 실제 CLOVA OCR 응답을 파싱하는 자리 (구현 시 채울 것)
async function callClovaOcr(imageBase64: string): Promise<ParsedReceipt> {
  const url = process.env.CLOVA_OCR_URL;
  const secret = process.env.CLOVA_OCR_SECRET;
  if (!url || !secret) {
    throw new Error("CLOVA OCR 환경변수가 설정되지 않음");
  }

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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OCR-SECRET": secret,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`CLOVA OCR 호출 실패: ${res.status}`);
  }

  const json = await res.json();
  // CLOVA의 receipt OCR 응답을 ParsedReceipt 형태로 변환
  // (실제 응답 스펙: https://api.ncloud-docs.com/docs/ai-application-service-ocr-receipt)
  return parseClovaResponse(json);
}

function parseClovaResponse(json: unknown): ParsedReceipt {
  // 단순화: 실제 연동 시 CLOVA receipt API 응답 구조에 맞춰 채울 것
  return {
    items: [],
    rawText: JSON.stringify(json).slice(0, 500),
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

export async function parseReceipt(
  imageBase64: string | null
): Promise<{ receipt: ParsedReceipt; usedMock: boolean }> {
  const hasReal = !!process.env.CLOVA_OCR_URL && !!process.env.CLOVA_OCR_SECRET;
  if (hasReal && imageBase64) {
    try {
      const receipt = await callClovaOcr(imageBase64);
      return { receipt, usedMock: false };
    } catch (e) {
      console.warn("[OCR] CLOVA 호출 실패, mock으로 fallback:", e);
    }
  }
  return { receipt: mockOcr(), usedMock: true };
}
