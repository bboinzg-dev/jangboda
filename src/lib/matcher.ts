// 영수증/외부데이터의 원본 상품명을 카탈로그 Product에 매칭
// 1차: ProductAlias 정확 매칭 (가장 신뢰 높음)
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

export async function matchProduct(rawName: string): Promise<string | null> {
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

export async function matchStore(hint: string | undefined): Promise<string | null> {
  if (!hint) return null;
  const norm = normalize(hint);
  if (norm.length < 2) return null;

  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
  });
  // 정확 일치 우선
  for (const s of stores) {
    if (normalize(s.name) === norm) return s.id;
  }
  // 부분 일치
  for (const s of stores) {
    const sn = normalize(s.name);
    if (sn.length < 2) continue;
    if (norm.includes(sn) || sn.includes(norm)) return s.id;
  }
  return null;
}
