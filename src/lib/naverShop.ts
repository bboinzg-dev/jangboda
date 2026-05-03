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
