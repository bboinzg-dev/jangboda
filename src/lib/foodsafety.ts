// 식품안전나라 OpenAPI 어댑터 — 가공식품 53,242건 DB
// 서비스: I2570 (가공식품 바코드 정보)
// 응답 필드: BRCD_NO, PRDT_NM, CMPNY_NM, HTRK_PRDLST_NM(대), HRNK_PRDLST_NM(중), PRDLST_NM(소)

const BASE = "http://openapi.foodsafetykorea.go.kr/api";
const SERVICE = "I2570";

export type FoodSafetyItem = {
  barcode: string;
  productName: string;
  manufacturer: string;
  category: { major: string; mid: string; minor: string };
  reportNo?: string;
  updatedAt?: string;
};

type ApiRow = {
  BRCD_NO?: string;
  PRDT_NM?: string;
  CMPNY_NM?: string;
  HTRK_PRDLST_NM?: string;
  HRNK_PRDLST_NM?: string;
  PRDLST_NM?: string;
  PRDLST_REPORT_NO?: string;
  LAST_UPDT_DTM?: string;
};

type ApiResponse = {
  I2570?: {
    total_count?: string;
    row?: ApiRow[];
    RESULT?: { CODE?: string; MSG?: string };
  };
};

function rowToItem(r: ApiRow): FoodSafetyItem {
  return {
    barcode: r.BRCD_NO ?? "",
    productName: r.PRDT_NM ?? "",
    manufacturer: r.CMPNY_NM ?? "",
    category: {
      major: r.HTRK_PRDLST_NM ?? "",
      mid: r.HRNK_PRDLST_NM ?? "",
      minor: r.PRDLST_NM ?? "",
    },
    reportNo: r.PRDLST_REPORT_NO,
    updatedAt: r.LAST_UPDT_DTM,
  };
}

// 바코드(GTIN)로 제품 1건 lookup — 가장 정확
export async function lookupByBarcode(barcode: string): Promise<FoodSafetyItem | null> {
  const key = process.env.KOREANNET_API_KEY ?? process.env.FOODSAFETY_API_KEY;
  if (!key) return null;
  const url = `${BASE}/${key}/${SERVICE}/json/1/1/BRCD_NO=${encodeURIComponent(barcode)}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as ApiResponse;
    const rows = json.I2570?.row;
    if (!rows || rows.length === 0) return null;
    return rowToItem(rows[0]);
  } catch (e) {
    console.warn("[foodsafety] lookupByBarcode 실패:", e);
    return null;
  }
}

// 제품명으로 검색 — 여러 결과 반환 (사용자 선택용)
export async function searchByName(query: string, limit = 10): Promise<FoodSafetyItem[]> {
  const key = process.env.KOREANNET_API_KEY ?? process.env.FOODSAFETY_API_KEY;
  if (!key || !query.trim()) return [];
  const url = `${BASE}/${key}/${SERVICE}/json/1/${Math.min(limit, 50)}/PRDT_NM=${encodeURIComponent(query.trim())}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as ApiResponse;
    const rows = json.I2570?.row ?? [];
    return rows.map(rowToItem);
  } catch (e) {
    console.warn("[foodsafety] searchByName 실패:", e);
    return [];
  }
}

// 우리 카탈로그 상품에 대한 best match — brand + name 결합 검색
export async function findBestMatchForProduct(
  productName: string,
  brand?: string | null
): Promise<FoodSafetyItem | null> {
  // 1. 브랜드 + 핵심 키워드로 검색
  const candidates = await searchByName(productName, 15);
  if (candidates.length === 0 && brand) {
    // 2. 브랜드만으로 fallback
    const byBrand = await searchByName(brand, 5);
    if (byBrand.length > 0) return byBrand[0];
    return null;
  }
  if (candidates.length === 0) return null;

  // 정규화 후 brand 매칭 우선
  const normalize = (s: string) =>
    s.toLowerCase().replace(/\s+/g, "").replace(/[^가-힣a-z0-9]/g, "");
  const targetN = normalize(productName);
  const brandN = brand ? normalize(brand) : "";

  // 점수: brand 일치(+3) + 정규화된 name 일치도(0~3)
  let best: { item: FoodSafetyItem; score: number } | null = null;
  for (const c of candidates) {
    const cName = normalize(c.productName);
    const cMfr = normalize(c.manufacturer);
    let score = 0;
    if (brandN && (cMfr.includes(brandN) || cName.includes(brandN))) score += 3;
    // name 부분 매칭 (긴 substring 일치)
    const minLen = Math.min(targetN.length, cName.length);
    if (minLen >= 4) {
      if (cName.includes(targetN) || targetN.includes(cName)) score += 3;
      else if (
        targetN
          .split(/(?<=.{2})/)
          .some((chunk) => chunk.length >= 3 && cName.includes(chunk))
      )
        score += 1;
    }
    if (!best || score > best.score) best = { item: c, score };
  }
  // 점수 낮으면 신뢰 안 함
  if (!best || best.score < 3) return null;
  return best.item;
}
