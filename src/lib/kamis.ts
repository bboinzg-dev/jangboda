// KAMIS (한국 농수산물유통공사) 가격 API 어댑터
// 공식 문서: https://www.kamis.or.kr/customer/reference/openapi_list.do
//
// KAMIS는 (인증키, ID) 페어가 필요합니다.
//   KAMIS_CERT_KEY  — 발급받은 UUID 인증키
//   KAMIS_CERT_ID   — KAMIS 가입 시 본인 ID (영문/숫자)
// 둘 다 있어야 실제 호출, 하나라도 없으면 mock 데이터 반환

export type KamisPrice = {
  productCode: string;
  productName: string;
  unit: string;
  retailPrice: number;
  date: string;
  // 전 조사일 대비 변동 — 홈 ticker / /kamis 페이지 표시용
  // KAMIS API의 dpr2(1일전), dpr3(1주전), dpr4(2주전), dpr6(전년) 응답 활용
  previousPrice?: number;          // dpr2 — 직전 조사일 가격
  changeAmount?: number;            // retailPrice - previousPrice
  changePct?: number;               // (changeAmount / previousPrice) * 100
  weeklyAverage?: number;           // dpr3 — 1주전 가격 (참고용)
  // KAMIS 응답에 등급/품종/원산지 일부 있음 — 농수산물 풍부화에 활용
  grade?: string;     // 등급 — "특품", "상품" 등 (rank/kind_name)
  kindName?: string;  // 품종 — "조생", "후지" 등
  origin?: string;    // 원산지 — 도매시장이나 산지 (있으면)
};

const KAMIS_BASE = "http://www.kamis.or.kr/service/price/xml.do";

// 우리가 자주 보는 농수산물 — KAMIS 부류/품목 코드
// 부류: 100=식량작물, 200=채소류, 300=특용작물, 400=과일류, 500=축산물, 600=수산물
export const KAMIS_TARGETS = [
  { itemCategory: "200", itemCode: "211", name: "양배추", unit: "1포기" },
  { itemCategory: "200", itemCode: "212", name: "배추", unit: "1포기" },
  { itemCategory: "200", itemCode: "231", name: "무", unit: "1개" },
  { itemCategory: "100", itemCode: "152", name: "감자", unit: "1kg" },
  { itemCategory: "200", itemCode: "245", name: "양파", unit: "1kg" },
  { itemCategory: "200", itemCode: "248", name: "대파", unit: "1단" },
  { itemCategory: "200", itemCode: "258", name: "마늘", unit: "1kg" },
  { itemCategory: "400", itemCode: "411", name: "사과", unit: "10개" },
  { itemCategory: "400", itemCode: "421", name: "배", unit: "10개" },
  { itemCategory: "500", itemCode: "611", name: "쇠고기(한우 등심)", unit: "100g" },
  { itemCategory: "500", itemCode: "514", name: "돼지고기(삼겹살)", unit: "100g" },
  { itemCategory: "500", itemCode: "515", name: "계란", unit: "30구" },
];

// dailyPriceByCategoryList: 부류별 일일 소매가
// 응답 형태:
// { data: { error_code: "000", item: [{ item_name, kind_name, unit, dpr1, ... }] } }
async function callKamisCategory(
  itemCategory: string,
  date: string,
  certKey: string,
  certId: string
): Promise<Array<Record<string, string>>> {
  const params = new URLSearchParams({
    action: "dailyPriceByCategoryList",
    p_product_cls_code: "01",          // 01=소매, 02=도매
    p_country_code: "1101",             // 1101=서울
    p_regday: date,
    p_convert_kg_yn: "N",
    p_item_category_code: itemCategory,
    p_cert_key: certKey,
    p_cert_id: certId,
    p_returntype: "json",
  });

  const url = `${KAMIS_BASE}?${params}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`KAMIS HTTP ${res.status}`);
  const text = await res.text();

  // 일부 응답이 BOM/공백으로 시작할 수 있음
  const cleaned = text.trim().replace(/^﻿/, "");
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    throw new Error(`KAMIS 응답 파싱 실패: ${cleaned.slice(0, 200)}`);
  }

  // 인증 실패 또는 오류 처리
  const obj = json as Record<string, unknown>;
  const errCode = (obj?.errCode ?? obj?.error_code) as string | undefined;
  if (errCode && errCode !== "000") {
    const errMsg = (obj?.errMsg ?? obj?.error_msg ?? "알 수 없는 오류") as string;
    throw new Error(`KAMIS 오류 ${errCode}: ${errMsg}`);
  }

  // 응답 구조 변형 처리: data.item 또는 price[]
  const data = obj?.data as Record<string, unknown> | undefined;
  const items = (data?.item ?? obj?.price ?? []) as Array<Record<string, string>>;
  return Array.isArray(items) ? items : [];
}

async function callKamisAll(
  date: string,
  certKey: string,
  certId: string
): Promise<KamisPrice[]> {
  const categories = Array.from(new Set(KAMIS_TARGETS.map((t) => t.itemCategory)));
  const out: KamisPrice[] = [];
  const errors: string[] = [];

  for (const cat of categories) {
    try {
      const items = await callKamisCategory(cat, date, certKey, certId);
      for (const it of items) {
        const target = KAMIS_TARGETS.find(
          (t) =>
            t.itemCategory === cat &&
            it.item_name &&
            (it.item_name === t.name || it.item_name.includes(t.name) || t.name.includes(it.item_name))
        );
        if (!target) continue;
        // dpr1 = 당일, dpr2 = 1일전, dpr3 = 1주전 — 콤마/공백/대시 제거 후 파싱
        const parsePrice = (s: string | undefined): number | undefined => {
          if (!s) return undefined;
          const n = parseInt(s.replace(/[, \-]/g, ""), 10);
          return Number.isFinite(n) && n > 0 ? n : undefined;
        };
        const price = parsePrice(it.dpr1);
        if (!price) continue;
        const previousPrice = parsePrice(it.dpr2);
        const changeAmount =
          previousPrice !== undefined ? price - previousPrice : undefined;
        const changePct =
          previousPrice && previousPrice > 0
            ? ((price - previousPrice) / previousPrice) * 100
            : undefined;
        // KAMIS unit 필드는 일관되지 않음:
        //  - 어떤 품목은 "kg" / "L" (앞에 "1" 붙여야 "1kg"/"1L"이 됨)
        //  - 어떤 품목은 이미 "100g" / "10개" (그대로 써야 함 — 앞에 "1" 붙이면 "1100g" 버그)
        // 안전하게 KAMIS_TARGETS의 fixed unit 우선, 없으면 it.unit 그대로.
        const apiUnit = it.unit?.trim() || "";
        const unit = target.unit
          || (/^\d/.test(apiUnit) ? apiUnit : (apiUnit ? `1${apiUnit}` : "1개"));
        out.push({
          productCode: target.itemCode,
          productName: target.name,
          unit,
          retailPrice: price,
          date,
          previousPrice,
          changeAmount,
          changePct,
          weeklyAverage: parsePrice(it.dpr3),
          grade: it.rank || it.kind_name,  // 등급 (특품/상품 등)
          kindName: it.kind_name,          // 품종 (조생/후지 등)
          origin: it.country_name || it.local_name, // 원산지 (있으면)
        });
      }
    } catch (e) {
      errors.push(`${cat}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (out.length === 0 && errors.length > 0) {
    throw new Error(`모든 카테고리 실패: ${errors.join(" / ")}`);
  }

  return out;
}

function mockKamisData(date: string): KamisPrice[] {
  return [
    { productCode: "211", productName: "양배추", unit: "1포기", retailPrice: 4280, date },
    { productCode: "212", productName: "배추", unit: "1포기", retailPrice: 5180, date },
    { productCode: "231", productName: "무", unit: "1개", retailPrice: 2890, date },
    { productCode: "152", productName: "감자", unit: "1kg", retailPrice: 4480, date },
    { productCode: "245", productName: "양파", unit: "1kg", retailPrice: 3280, date },
    { productCode: "248", productName: "대파", unit: "1단", retailPrice: 3580, date },
    { productCode: "258", productName: "마늘", unit: "1kg", retailPrice: 12800, date },
    { productCode: "411", productName: "사과", unit: "10개", retailPrice: 28900, date },
    { productCode: "421", productName: "배", unit: "10개", retailPrice: 32800, date },
    { productCode: "611", productName: "쇠고기(한우 등심)", unit: "100g", retailPrice: 12800, date },
    { productCode: "514", productName: "돼지고기(삼겹살)", unit: "100g", retailPrice: 2980, date },
    { productCode: "515", productName: "계란", unit: "30구", retailPrice: 8580, date },
  ];
}

export type KamisFetchResult = {
  prices: KamisPrice[];
  usedMock: boolean;
  date: string;
  error?: string;
};

// 주말/공휴일은 KAMIS 응답이 비어있을 수 있어 최근 평일까지 최대 5일 fallback
function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export async function fetchKamisPrices(): Promise<KamisFetchResult> {
  const today = dateOffset(0);
  const certKey = process.env.KAMIS_CERT_KEY;
  const certId = process.env.KAMIS_CERT_ID;

  if (!certKey || !certId) {
    return {
      prices: mockKamisData(today),
      usedMock: true,
      date: today,
      error: !certKey
        ? "KAMIS_CERT_KEY 미설정"
        : "KAMIS_CERT_ID 미설정 (KAMIS는 인증키와 ID 두 개가 필요합니다)",
    };
  }

  // 주말/공휴일은 데이터 없을 수 있어 오늘 → 어제 → ... 최대 5일 fallback
  let lastError: string | undefined;
  for (let off = 0; off <= 5; off++) {
    const date = dateOffset(off);
    try {
      const prices = await callKamisAll(date, certKey, certId);
      if (prices.length > 0) return { prices, usedMock: false, date };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`[KAMIS] ${date}:`, lastError);
    }
  }

  return {
    prices: mockKamisData(today),
    usedMock: true,
    date: today,
    error: lastError ?? "KAMIS 응답이 5일 연속 비어있음 — mock 대체",
  };
}
