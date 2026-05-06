// 네이버 쇼핑 검색 API 어댑터
// 공식 문서: https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md
//
// 한 번 호출로 쿠팡/지마켓/SSG/11번가 등 주요 온라인몰의 가격이 mallName으로 구분되어 옵니다.
//
// 환경변수:
//   NAVER_SHOP_CLIENT_ID
//   NAVER_SHOP_CLIENT_SECRET

const API_URL = "https://openapi.naver.com/v1/search/shop.json";

export type NaverShopItem = {
  title: string;     // HTML 태그 strip된 상품명
  link: string;
  image: string;
  lprice: number;    // 최저가 (원)
  hprice: number;    // 최고가
  mallName: string;  // "쿠팡", "G마켓", "11번가" 등
  productId: string;
  brand: string;
  category: string;
};

export type NaverFetchResult = {
  items: NaverShopItem[];
  usedMock: boolean;
  query: string;
  error?: string;
};

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function callNaverApi(
  query: string,
  clientId: string,
  clientSecret: string
): Promise<NaverShopItem[]> {
  const url = `${API_URL}?query=${encodeURIComponent(query)}&display=30&sort=asc`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`네이버 API ${res.status}: ${text.slice(0, 150)}`);
  }
  const json = await res.json();
  const items = (json.items ?? []) as Array<Record<string, string>>;
  return items.map((it) => ({
    title: stripHtml(it.title || ""),
    link: it.link || "",
    image: it.image || "",
    lprice: parseInt((it.lprice || "0").replace(/[^\d]/g, ""), 10) || 0,
    hprice: parseInt((it.hprice || "0").replace(/[^\d]/g, ""), 10) || 0,
    mallName: it.mallName || "기타",
    productId: it.productId || "",
    brand: it.brand || "",
    category: [it.category1, it.category2, it.category3]
      .filter(Boolean)
      .join("/"),
  }));
}

function mockNaverShop(query: string): NaverShopItem[] {
  // 데모용: 주요 온라인몰의 그럴듯한 가격 반환
  const base = 4000 + Math.floor(Math.random() * 2000);
  return [
    { title: `${query}`, link: "", image: "", lprice: base - 200, hprice: 0, mallName: "쿠팡", productId: "mock1", brand: "", category: "" },
    { title: `${query}`, link: "", image: "", lprice: base, hprice: 0, mallName: "G마켓", productId: "mock2", brand: "", category: "" },
    { title: `${query}`, link: "", image: "", lprice: base + 150, hprice: 0, mallName: "SSG.COM", productId: "mock3", brand: "", category: "" },
    { title: `${query}`, link: "", image: "", lprice: base + 80, hprice: 0, mallName: "11번가", productId: "mock4", brand: "", category: "" },
  ];
}

export async function fetchNaverShop(query: string): Promise<NaverFetchResult> {
  const id = process.env.NAVER_SHOP_CLIENT_ID;
  const secret = process.env.NAVER_SHOP_CLIENT_SECRET;
  if (!id || !secret) {
    return {
      items: mockNaverShop(query),
      usedMock: true,
      query,
      error: "NAVER_SHOP_CLIENT_ID/SECRET 미설정",
    };
  }
  try {
    const items = await callNaverApi(query, id, secret);
    if (items.length === 0) {
      return { items: mockNaverShop(query), usedMock: true, query, error: "검색 결과 없음" };
    }
    return { items, usedMock: false, query };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[Naver]", msg);
    return { items: mockNaverShop(query), usedMock: true, query, error: msg };
  }
}

// "2개 묶음" / "x2 세트" 같은 multi-pack 상품은 가격이 단일 SKU의 N배라
// 같은 product에 등록되면 비교 부정확. title 휴리스틱으로 제외.
const MULTIPACK_PATTERNS: RegExp[] = [
  /\b[xX×]\s*[2-9]\b/,                  // x2, X3, ×4
  /\bx\s*[2-9]\s*개/,                    // x2개
  /[2-9]\s*개\s*묶음/,                   // 2개 묶음
  /[2-9]\s*개\s*세트/,                   // 3개 세트
  /[2-9]\s*개\s*입\s*\d+\s*세트/,        // 5개입 2세트
  /\b[2-9]\s*세트\b/,                    // 2세트
  /\b[2-9]\s*PACK/i,                     // 2PACK
  /[2-9]\s*개\s*[xX×]\s*\d+/,           // 5개 x 2
  /^\s*\[\s*[2-9]\s*개\s*\]/,           // [2개] 시작
  /\(\s*[2-9]\s*개\s*\)/,                // (2개)
  /[2-9]\s*개입\s*[xX×]\s*[2-9]/,       // 5개입 x 2
  /\b[2-9]\s*box\b/i,                    // 2box
  /번들\s*[2-9]/,                        // 번들 2
  /[2-9]\s*box\s*묶음/i,
];

function isMultiPack(title: string): boolean {
  return MULTIPACK_PATTERNS.some((p) => p.test(title));
}

// mall별 최저가 1건씩 압축 — multi-pack은 제외
export function pickLowestByMall(items: NaverShopItem[]): NaverShopItem[] {
  const byMall = new Map<string, NaverShopItem>();
  for (const it of items) {
    if (it.lprice <= 0) continue;
    if (isMultiPack(it.title)) continue; // 묶음 판매 제외
    const cur = byMall.get(it.mallName);
    if (!cur || it.lprice < cur.lprice) byMall.set(it.mallName, it);
  }
  return Array.from(byMall.values()).sort((a, b) => a.lprice - b.lprice);
}

// ─── enrich 전용 (백필 / 영수증 등록 폴백) ────────────────────────────────
//
// 네이버 쇼핑에서 상품명·바코드로 검색하여 이미지·brand·category 추출.
// 식약처(C005/I2570)는 가공식품 53,242건만 커버하므로 베이커리·PB·즉석식품 등은
// 네이버 폴백으로 채움.

export type NaverEnrichResult = {
  cleanedQuery: string;
  title: string | null;       // best-match 상품명 (HTML strip됨)
  brand: string | null;
  category: string | null;    // "식품/가공식품/즉석식품" 형태
  imageUrl: string | null;
  productLink: string | null;
  mallName: string | null;
  matchScore: number;         // 0~1 — 결과 신뢰도
};

// OCR 잡음 정리 — 영수증 자동 등록 시 발생하는 패턴들
//   "C_ 자연애찬_일반" → "자연애찬"
//   "닥터유 에너지바(40g)" → "닥터유 에너지바"
//   "스팸 클래식 200G x 2" → "스팸 클래식"
//
// 주의: 괄호 안이 단위/포장 표기일 때만 제거.
//   "돼지고기(삼겹살)" 처럼 부위/속성이면 보존 (정보 손실 방지)
function cleanOcrName(rawName: string): string {
  let s = rawName.trim();
  // 앞뒤의 단일 알파벳 + 언더스코어 제거 ("C_ 자연애찬" → "자연애찬")
  s = s.replace(/^[A-Za-z]{1,2}_+\s*/, "");
  // "_일반" / "_기획" / "_특가" 같은 옵션 표식 제거
  s = s.replace(/_(?:일반|기획|특가|행사|할인|무료배송|증정|set|set\d+)$/gi, "");
  // 괄호 안이 단위·포장 표기일 때만 제거 (숫자 + 단위, 또는 "n개입" 같은 것)
  // "(40g)", "(3개입)", "(4개)", "(250ml)" → 제거
  // "(삼겹살)", "(등심)" 등 한글-only는 보존
  s = s.replace(
    /\(\s*\d+(?:\.\d+)?\s*(?:g|kg|ml|l|개입|개|매|입|봉|팩|박스|set)\s*\)/gi,
    " ",
  );
  // 단위 표기 제거 (괄호 없는 형태)
  s = s.replace(/\b\d+(?:\.\d+)?\s*(?:g|kg|ml|l|개입|개|매|입|봉|팩|박스|set)\b/gi, " ");
  // multi-pack 표기
  s = s.replace(/\b[xX×]\s*\d+\b/g, " ");
  // 트레일링 언더스코어
  s = s.replace(/_+/g, " ");
  // 다중 공백 정리
  s = s.replace(/\s+/g, " ").trim();
  return s || rawName.trim();
}

// 한·영 정규화 — 매칭 점수용
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "").replace(/[^가-힣a-z0-9]/g, "");
}

// 토큰 overlap (정규화 후) — 검색어 토큰이 candidate에 얼마나 들어있나
function tokenOverlapRatio(query: string, candidate: string): number {
  const qTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (qTokens.length === 0) return 0;
  const cNorm = normalizeForMatch(candidate);
  let hit = 0;
  for (const t of qTokens) {
    if (cNorm.includes(normalizeForMatch(t))) hit++;
  }
  return hit / qTokens.length;
}

// 네이버 쇼핑 결과에서 best item 선정
// - multi-pack 제외 (가격이 N배라 매칭 부정확)
// - title이 검색어와 토큰 겹침 ≥ 60% 인 것 우선
// - 동점이면 lprice 낮은 (인기·정상가 상품일 가능성)
function pickBestEnrichItem(
  items: NaverShopItem[],
  cleanedQuery: string,
): { item: NaverShopItem; score: number } | null {
  if (items.length === 0) return null;
  let best: { item: NaverShopItem; score: number } | null = null;
  for (const it of items) {
    if (isMultiPack(it.title)) continue;
    const score = tokenOverlapRatio(cleanedQuery, it.title);
    if (score < 0.4) continue; // 너무 낮으면 skip — 엉뚱한 매칭 방지
    if (!best || score > best.score || (score === best.score && it.lprice > 0 && it.lprice < best.item.lprice)) {
      best = { item: it, score };
    }
  }
  return best;
}

// 상품명(필요시 바코드)으로 네이버 쇼핑에서 enrich 정보 추출.
// 검색 실패/결과 불충분 시 null 반환 — 호출 측에서 다른 폴백 사용.
//
// 조용한 timeout: 3.5초 (UI flow에서 호출되어도 응답 지연 최소)
export async function enrichByName(
  rawName: string,
  options?: { barcode?: string; timeoutMs?: number },
): Promise<NaverEnrichResult | null> {
  const id = process.env.NAVER_SHOP_CLIENT_ID;
  const secret = process.env.NAVER_SHOP_CLIENT_SECRET;
  if (!id || !secret) return null;

  const cleaned = cleanOcrName(rawName);
  if (cleaned.length < 2) return null;

  const timeoutMs = options?.timeoutMs ?? 3500;

  // 검색 후보 — 바코드(있으면 먼저, 한국몰들은 매칭률 낮지만 시도) → cleaned name
  const queries: string[] = [];
  if (options?.barcode && /^\d{8,14}$/.test(options.barcode)) {
    queries.push(options.barcode);
  }
  queries.push(cleaned);

  for (const q of queries) {
    try {
      const items = await Promise.race<NaverShopItem[]>([
        callNaverApi(q, id, secret),
        new Promise<NaverShopItem[]>((resolve) =>
          setTimeout(() => resolve([]), timeoutMs),
        ),
      ]);
      if (items.length === 0) continue;
      const best = pickBestEnrichItem(items, cleaned);
      if (!best) continue;
      const it = best.item;
      return {
        cleanedQuery: cleaned,
        title: it.title || null,
        brand: it.brand?.trim() || null,
        category: it.category?.trim() || null,
        imageUrl: it.image || null,
        productLink: it.link || null,
        mallName: it.mallName || null,
        matchScore: best.score,
      };
    } catch {
      // silent — 다음 쿼리 시도
    }
  }
  return null;
}
