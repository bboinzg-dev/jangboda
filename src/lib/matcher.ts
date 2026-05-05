// 영수증/외부데이터의 원본 상품명을 카탈로그 Product에 매칭
// 0차: GTIN/EAN 바코드 정확 매칭 (가장 신뢰 높음 — 영수증에 바코드 출력되는 마트만)
// 1차: ProductAlias 정확 매칭
// 2차: 정규화 후 정확 일치
// 3차: 정규화 후 부분 일치 (양쪽 길이 차이 ±30% 이내일 때만)
// 4차: 상품명 직접 비교 (보수적)
//
// "참치" 같은 너무 짧은 단어가 모든 참치 상품에 매칭되는 걸 막기 위해
// 길이 임계값(MIN_MATCH_LEN)과 길이 비율(LEN_RATIO_MIN)을 적용

import { prisma } from "./db";

const MIN_MATCH_LEN = 4;       // 4글자 미만은 매칭 보수적으로
const LEN_RATIO_MIN = 0.6;     // 양쪽 길이 비율 60% 이상이어야 부분 매칭 인정

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()×x*]/g, "")
    .replace(/[^가-힣a-z0-9]/g, "");
}

// 두 문자열 길이가 충분히 비슷한지 (한 쪽이 다른 쪽의 부분집합으로 매칭될 때)
function lengthRatioOk(a: string, b: string): boolean {
  const longer = Math.max(a.length, b.length);
  const shorter = Math.min(a.length, b.length);
  if (shorter === 0) return false;
  return shorter / longer >= LEN_RATIO_MIN;
}

export async function matchProduct(
  rawName: string,
  barcode?: string
): Promise<string | null> {
  // 0. 바코드 정확 매칭 — 킴스클럽/이마트/롯데마트 등 EAN-13 출력 영수증에서 가장 신뢰
  // Product.barcode가 @unique이므로 findUnique로 한 번에 확정
  if (barcode && /^\d{8,14}$/.test(barcode.trim())) {
    const byBarcode = await prisma.product.findUnique({
      where: { barcode: barcode.trim() },
      select: { id: true },
    });
    if (byBarcode) return byBarcode.id;
  }

  if (!rawName || !rawName.trim()) return null;
  const normalized = normalize(rawName);
  if (normalized.length < MIN_MATCH_LEN) {
    // 너무 짧으면 정확 매칭만 허용 (예: "콜라" → 너무 모호)
    const exactAlias = await prisma.productAlias.findFirst({
      where: { alias: rawName },
    });
    return exactAlias?.productId ?? null;
  }

  // 1. alias 정확 매칭
  const exactAlias = await prisma.productAlias.findFirst({
    where: { alias: rawName },
    select: { productId: true },
  });
  if (exactAlias) return exactAlias.productId;

  // 2~4. 정규화된 비교
  const allAliases = await prisma.productAlias.findMany({
    select: { productId: true, alias: true },
  });
  const allProducts = await prisma.product.findMany({
    select: { id: true, name: true },
  });

  // 2. 정규화 후 정확 일치
  for (const a of allAliases) {
    if (normalize(a.alias) === normalized) return a.productId;
  }
  for (const p of allProducts) {
    if (normalize(p.name) === normalized) return p.id;
  }

  // 3. 부분 포함 (길이 비율 확인 — "참치"가 "참치김밥" 매칭 방지)
  let bestMatch: { id: string; score: number } | null = null;
  for (const a of allAliases) {
    const an = normalize(a.alias);
    if (an.length < MIN_MATCH_LEN) continue;
    if (!lengthRatioOk(normalized, an)) continue;
    if (normalized.includes(an) || an.includes(normalized)) {
      const score = Math.min(normalized.length, an.length) / Math.max(normalized.length, an.length);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: a.productId, score };
      }
    }
  }
  for (const p of allProducts) {
    const pn = normalize(p.name);
    if (pn.length < MIN_MATCH_LEN) continue;
    if (!lengthRatioOk(normalized, pn)) continue;
    if (normalized.includes(pn) || pn.includes(normalized)) {
      const score = Math.min(normalized.length, pn.length) / Math.max(normalized.length, pn.length);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: p.id, score };
      }
    }
  }

  return bestMatch?.id ?? null;
}

// 분점 번호 제거 — "천호2점" → "천호점", "잠실1호점" → "잠실점"
// 영수증은 보통 "천호점"으로만 표기, DB는 "천호2점" 같이 분점 번호 포함된 케이스 매칭용
function looseNormalize(s: string): string {
  return normalize(s)
    .replace(/(\d+)호점/g, "점")
    .replace(/(\d+)점/g, "점");
}

// 영수증/매장 주소에서 도로명+번지 토큰 추출 — "구천면로 189", "테헤란로 152" 등
// 같은 도로명+번지면 분점 번호 표기 차이 무관 같은 매장으로 확정.
// "...로", "...길", "...대로" 모두 지원.
const ROAD_TOKEN_RE = /([가-힣A-Za-z0-9]+(?:로|대로|길))\s*(\d+(?:-\d+)?)/g;
function extractRoadTokens(address: string | undefined | null): string[] {
  if (!address) return [];
  const tokens: string[] = [];
  for (const m of address.matchAll(ROAD_TOKEN_RE)) {
    tokens.push(`${m[1]}${m[2]}`); // "구천면로189" 형태로 정규화
  }
  return tokens;
}

export async function matchStore(
  hint: string | undefined,
  address?: string,
): Promise<string | null> {
  // 0순위: 주소(도로명+번지) 매칭 — 가장 robust
  // 영수증 "서울시 강동구 구천면로 189"가 DB store.address와 도로명+번지 공유하면 같은 매장 확정
  // 분점 번호("천호점" vs "천호2점") 표기 차이 무관
  const hintTokens = extractRoadTokens(address);
  if (hintTokens.length > 0) {
    const stores = await prisma.store.findMany({
      select: { id: true, name: true, address: true },
    });
    for (const s of stores) {
      const storeTokens = extractRoadTokens(s.address);
      if (storeTokens.some((t) => hintTokens.includes(t))) return s.id;
    }
  }

  if (!hint) return null;
  const norm = normalize(hint);
  if (norm.length < 2) return null;

  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
  });
  // 1순위: 정규화 후 정확 일치
  for (const s of stores) {
    if (normalize(s.name) === norm) return s.id;
  }
  // 2순위: 정규화 후 부분 일치
  for (const s of stores) {
    const sn = normalize(s.name);
    if (sn.length < 2) continue;
    if (norm.includes(sn) || sn.includes(norm)) return s.id;
  }
  // 3순위: 분점 번호 제거 후 매칭 ("킴스클럽 천호점" ↔ "킴스클럽 천호2점")
  const looseHint = looseNormalize(hint);
  if (looseHint.length >= 2) {
    for (const s of stores) {
      const sn = looseNormalize(s.name);
      if (sn.length < 2) continue;
      if (sn === looseHint) return s.id;
      if (sn.includes(looseHint) || looseHint.includes(sn)) return s.id;
    }
  }
  return null;
}
