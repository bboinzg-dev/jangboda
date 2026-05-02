// 영수증 OCR로 추출된 원본 상품명을 카탈로그 Product에 매칭
// 1차: ProductAlias 정확 매칭
// 2차: 정규화 후 부분 포함 매칭
// 그래도 못 찾으면 null → 사용자가 직접 매핑 / 신규 등록 유도

import { prisma } from "./db";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()×x*]/g, "")
    .replace(/[^가-힣a-z0-9]/g, "");
}

export async function matchProduct(rawName: string): Promise<string | null> {
  const normalized = normalize(rawName);

  // 1. alias 정확 매칭
  const exactAlias = await prisma.productAlias.findFirst({
    where: { alias: rawName },
    select: { productId: true },
  });
  if (exactAlias) return exactAlias.productId;

  // 2. 모든 alias 가져와서 정규화 비교 (소규모 카탈로그에서는 OK)
  const allAliases = await prisma.productAlias.findMany({
    select: { productId: true, alias: true },
  });
  for (const a of allAliases) {
    if (normalize(a.alias) === normalized) return a.productId;
  }

  // 3. 부분 포함 (raw가 alias를 포함하거나 반대)
  for (const a of allAliases) {
    const an = normalize(a.alias);
    if (normalized.includes(an) || an.includes(normalized)) {
      return a.productId;
    }
  }

  // 4. 상품명 직접 비교
  const allProducts = await prisma.product.findMany({
    select: { id: true, name: true },
  });
  for (const p of allProducts) {
    const pn = normalize(p.name);
    if (pn === normalized || normalized.includes(pn) || pn.includes(normalized)) {
      return p.id;
    }
  }

  return null;
}

export async function matchStore(hint: string | undefined): Promise<string | null> {
  if (!hint) return null;
  const norm = normalize(hint);
  const stores = await prisma.store.findMany({
    select: { id: true, name: true },
  });
  for (const s of stores) {
    const sn = normalize(s.name);
    if (sn === norm || norm.includes(sn) || sn.includes(norm)) {
      return s.id;
    }
  }
  return null;
}
