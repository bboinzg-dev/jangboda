// 식품안전나라 OpenAPI 어댑터
// 사용 서비스 (사용자 신청 완료):
//   - C005: 바코드연계제품정보 (47번) — 소비기한/제조사 주소/식품유형까지 (메인)
//   - I2570: 가공식품 바코드정보 (136번) — 53,242건, 카테고리 대/중/소 분류 (검색용)

const BASE = "http://openapi.foodsafetykorea.go.kr/api";

export type FoodSafetyItem = {
  barcode: string;
  productName: string;
  manufacturer: string;
  foodType?: string;          // 식품유형 (PRDLST_DCNM): "유탕면", "캔디류" 등
  category?: { major?: string; mid?: string; minor?: string }; // I2570에서만
  shelfLife?: string;         // 소비기한 (POG_DAYCNT)
  manufacturerAddress?: string; // 제조사 주소
  reportNo?: string;
  reportDate?: string;
  endDate?: string;
  industry?: string;
  closedDate?: string;
};

type C005Row = {
  BAR_CD?: string;
  PRDLST_NM?: string;
  BSSH_NM?: string;
  PRDLST_DCNM?: string;
  POG_DAYCNT?: string;
  SITE_ADDR?: string;
  PRDLST_REPORT_NO?: string;
  PRMS_DT?: string;
  END_DT?: string;
  INDUTY_NM?: string;
  CLSBIZ_DT?: string;
};

type I2570Row = {
  BRCD_NO?: string;
  PRDT_NM?: string;
  CMPNY_NM?: string;
  HTRK_PRDLST_NM?: string;
  HRNK_PRDLST_NM?: string;
  PRDLST_NM?: string;
  PRDLST_REPORT_NO?: string;
};

function rowC005(r: C005Row): FoodSafetyItem {
  return {
    barcode: r.BAR_CD ?? "",
    productName: r.PRDLST_NM ?? "",
    manufacturer: r.BSSH_NM ?? "",
    foodType: r.PRDLST_DCNM,
    shelfLife: r.POG_DAYCNT,
    manufacturerAddress: r.SITE_ADDR,
    reportNo: r.PRDLST_REPORT_NO,
    reportDate: r.PRMS_DT,
    endDate: r.END_DT || undefined,
    industry: r.INDUTY_NM,
    closedDate: r.CLSBIZ_DT || undefined,
  };
}

function rowI2570(r: I2570Row): FoodSafetyItem {
  return {
    barcode: r.BRCD_NO ?? "",
    productName: r.PRDT_NM ?? "",
    manufacturer: r.CMPNY_NM ?? "",
    foodType: r.PRDLST_NM,
    category: {
      major: r.HTRK_PRDLST_NM,
      mid: r.HRNK_PRDLST_NM,
      minor: r.PRDLST_NM,
    },
    reportNo: r.PRDLST_REPORT_NO,
  };
}

function getKey(): string | null {
  return process.env.KOREANNET_API_KEY ?? process.env.FOODSAFETY_API_KEY ?? null;
}

// 바코드 → 정확한 1건 lookup. C005 메인 + I2570로 카테고리 보강
export async function lookupByBarcode(barcode: string): Promise<FoodSafetyItem | null> {
  const key = getKey();
  if (!key) return null;

  try {
    const url = `${BASE}/${key}/C005/json/1/1/BAR_CD=${encodeURIComponent(barcode)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { C005?: { row?: C005Row[] } };
      const row = json.C005?.row?.[0];
      if (row) {
        const item = rowC005(row);
        // I2570에서 카테고리 정보 보강 (best-effort)
        try {
          const url2 = `${BASE}/${key}/I2570/json/1/1/BRCD_NO=${encodeURIComponent(barcode)}`;
          const res2 = await fetch(url2, { cache: "no-store" });
          if (res2.ok) {
            const j2 = (await res2.json()) as { I2570?: { row?: I2570Row[] } };
            const r2 = j2.I2570?.row?.[0];
            if (r2) {
              item.category = {
                major: r2.HTRK_PRDLST_NM,
                mid: r2.HRNK_PRDLST_NM,
                minor: r2.PRDLST_NM,
              };
            }
          }
        } catch {
          // ignore
        }
        return item;
      }
    }
  } catch (e) {
    console.warn("[foodsafety] C005 lookup 실패:", e);
  }

  // C005 못 찾으면 I2570 fallback
  try {
    const url = `${BASE}/${key}/I2570/json/1/1/BRCD_NO=${encodeURIComponent(barcode)}`;
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { I2570?: { row?: I2570Row[] } };
      const row = json.I2570?.row?.[0];
      if (row) return rowI2570(row);
    }
  } catch (e) {
    console.warn("[foodsafety] I2570 fallback 실패:", e);
  }

  return null;
}

// 제품명으로 검색 — I2570 (53,242건)
export async function searchByName(query: string, limit = 10): Promise<FoodSafetyItem[]> {
  const key = getKey();
  if (!key || !query.trim()) return [];
  try {
    const url = `${BASE}/${key}/I2570/json/1/${Math.min(limit, 50)}/PRDT_NM=${encodeURIComponent(query.trim())}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const json = (await res.json()) as { I2570?: { row?: I2570Row[] } };
    return (json.I2570?.row ?? []).map(rowI2570);
  } catch (e) {
    console.warn("[foodsafety] searchByName 실패:", e);
    return [];
  }
}

// best match — brand + name 점수 매칭 (보수적, 임계값 ↑)
export async function findBestMatchForProduct(
  productName: string,
  brand?: string | null
): Promise<FoodSafetyItem | null> {
  const tokens = (brand ? productName.replace(brand, "") : productName)
    .replace(/[()]/g, "")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  const candidates = [tokens[0], tokens.slice(0, 2).join(" "), productName].filter(Boolean);
  let rows: FoodSafetyItem[] = [];
  for (const q of candidates) {
    rows = await searchByName(q, 15);
    if (rows.length > 0) break;
  }
  if (rows.length === 0) return null;

  const normalize = (s: string) =>
    s.toLowerCase().replace(/\s+/g, "").replace(/[^가-힣a-z0-9]/g, "");
  const targetN = normalize(productName);
  const brandN = brand ? normalize(brand) : "";

  let best: { item: FoodSafetyItem; score: number } | null = null;
  for (const r of rows) {
    const cName = normalize(r.productName);
    const cMfr = normalize(r.manufacturer);
    let score = 0;
    if (brandN && (cMfr.includes(brandN) || cName.includes(brandN))) score += 2;
    if (cName.length >= 3 && targetN.length >= 3) {
      if (cName === targetN) score += 5;
      else if (cName.includes(targetN) || targetN.includes(cName)) score += 2;
    }
    if (!best || score > best.score) best = { item: r, score };
  }
  // 신뢰 임계값 ↑ — brand만으론 매칭 거부
  if (!best || best.score < 5) return null;
  return best.item;
}
