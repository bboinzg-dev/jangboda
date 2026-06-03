// 회수 식품 매칭 — 순수 함수만 (DB·푸시 없음).
// route.ts에서 DB로 데이터를 가져온 뒤 이 모듈로 매칭만 수행.
// 단위 테스트 가능하도록 외부 의존성을 분리해 둠.

export const NAME_OVERLAP_THRESHOLD = 0.6;

export type UserItem = {
  productId: string;
  barcode: string | null;
  name: string;
  manufacturer: string | null;
  lastSeenAt: Date;
};

export type RecallRow = {
  id: string;
  barcode: string | null;
  productName: string;
  manufacturer: string | null;
  reason: string;
  grade: string | null;
  registeredAt: Date;
};

export type RecallMatch = {
  item: UserItem;
  recall: RecallRow;
  matchType: "exact" | "fuzzy";
  score?: number;
};

// 제조사명 정규화 — "(주)농심" / "농심㈜" / "농심 주식회사" 동일하게.
export function normMfr(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[()（）\[\]【】㈜주식회사\s.,\-_]/g, "")
    .replace(/co\.?ltd\.?|inc\.?|corp\.?/gi, "");
}

// 제품명 토큰화 — 2자 이상 토큰만 (조사/단위 노이즈 제거).
export function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[()（）\[\]【】·,\-_/+]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

// recall 토큰 중 product에 들어있는 비율 (recall 기준 — 회수가 더 구체적임).
export function tokenOverlap(recallName: string, productName: string): number {
  const rt = nameTokens(recallName);
  if (rt.length === 0) return 0;
  const ptSet = new Set(nameTokens(productName));
  let hit = 0;
  for (const t of rt) if (ptSet.has(t)) hit++;
  return hit / rt.length;
}

/**
 * 회수 row 배열을 매칭에 쓰기 좋은 인덱스로 변환.
 * - byBarcode: barcode → RecallRow[]
 * - byMfrNorm: 정규화 manufacturer → RecallRow[] (단, userMfrNorm 필터에 포함된 것만)
 *
 * userMfrNorm을 미리 받아서 무관한 회수까지 인덱싱하지 않도록 한다 (비용·오탐 ↓).
 */
export function indexRecalls(
  recalls: RecallRow[],
  userMfrNorm: Set<string>,
): {
  byBarcode: Map<string, RecallRow[]>;
  byMfrNorm: Map<string, RecallRow[]>;
} {
  const byBarcode = new Map<string, RecallRow[]>();
  const byMfrNorm = new Map<string, RecallRow[]>();
  for (const r of recalls) {
    if (r.barcode) {
      const arr = byBarcode.get(r.barcode) ?? [];
      arr.push(r);
      byBarcode.set(r.barcode, arr);
    } else if (r.manufacturer) {
      const n = normMfr(r.manufacturer);
      if (!n || !userMfrNorm.has(n)) continue;
      const arr = byMfrNorm.get(n) ?? [];
      arr.push(r);
      byMfrNorm.set(n, arr);
    }
  }
  return { byBarcode, byMfrNorm };
}

/**
 * 한 사용자의 영수증 product items에 대해 회수 매칭 수행.
 * 1순위 barcode 정확매칭, 2순위 manufacturer 정규화 일치 + 토큰 overlap 60%↑.
 */
export function matchUserItems(
  items: Iterable<UserItem>,
  byBarcode: Map<string, RecallRow[]>,
  byMfrNorm: Map<string, RecallRow[]>,
): RecallMatch[] {
  const matches: RecallMatch[] = [];
  const matchedRecallIds = new Set<string>(); // 같은 사용자 안에서 중복 매칭 방지

  for (const item of items) {
    // 2-A. barcode 정확매칭
    if (item.barcode) {
      const matched = byBarcode.get(item.barcode);
      if (matched && matched.length > 0) {
        const latest = matched
          .slice()
          .sort((a, b) => b.registeredAt.getTime() - a.registeredAt.getTime())[0];
        matches.push({ item, recall: latest, matchType: "exact" });
        matchedRecallIds.add(latest.id);
        continue; // 정확매칭 됐으면 fallback 건너뜀
      }
    }

    // 2-B. fallback — manufacturer 정규화 일치 + 토큰 60%↑
    if (!item.manufacturer) continue;
    const mfrNorm = normMfr(item.manufacturer);
    if (!mfrNorm) continue;
    const candidates = byMfrNorm.get(mfrNorm);
    if (!candidates || candidates.length === 0) continue;

    let best: { recall: RecallRow; score: number } | null = null;
    for (const r of candidates) {
      if (matchedRecallIds.has(r.id)) continue;
      // 단일 토큰 회수명은 같은 제조사의 무관 제품을 과잉 매칭하기 쉽다
      // (예: 회수 "우유"가 같은 제조사 "딸기 우유 1L"에 100% 매칭). 토큰이 1개뿐이면
      // 그 토큰이 3자 이상(브랜드성: 신라면/초코파이 등)일 때만 fuzzy 허용해
      // 2자 일반 카테고리(우유/만두/라면/김치 등)의 오탐을 차단한다.
      const rTokens = nameTokens(r.productName);
      if (rTokens.length <= 1 && (rTokens[0]?.length ?? 0) < 3) continue;
      const score = tokenOverlap(r.productName, item.name);
      if (score >= NAME_OVERLAP_THRESHOLD) {
        if (!best || score > best.score) best = { recall: r, score };
      }
    }
    if (best) {
      matches.push({ item, recall: best.recall, matchType: "fuzzy", score: best.score });
      matchedRecallIds.add(best.recall.id);
    }
  }
  return matches;
}

/**
 * 매칭 결과를 푸시 알림 본문으로 포맷.
 * exact가 우선, 같으면 회수일 최신 순.
 */
export function buildRecallPushPayload(matches: RecallMatch[]): {
  title: string;
  body: string;
  url: string;
} | null {
  if (matches.length === 0) return null;
  const sorted = matches.slice().sort((a, b) => {
    if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
    return b.recall.registeredAt.getTime() - a.recall.registeredAt.getTime();
  });
  const first = sorted[0];
  const more = sorted.length > 1 ? ` 외 ${sorted.length - 1}건` : "";
  const title =
    first.matchType === "exact" ? "⚠️ 회수 대상 상품 발견" : "⚠️ 회수 대상 추정 상품";
  const bodySuffix =
    first.matchType === "exact"
      ? ""
      : ` (제조사·제품명 매칭, 정확도 ${Math.round((first.score ?? 0) * 100)}%)`;
  return {
    title,
    body: `최근에 산 "${first.item.name}"이(가) 식약처 회수 대상이에요${more}.\n사유: ${first.recall.reason.slice(0, 80)}${bodySuffix}`,
    url: `/products/${first.item.productId}`,
  };
}
