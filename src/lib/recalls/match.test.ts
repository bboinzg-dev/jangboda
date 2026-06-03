// 회수 매칭 순수 함수 단위 테스트
// barcode 정확매칭 / 제조사+토큰 fallback 매칭 / 푸시 페이로드 빌더
import { describe, expect, it } from "vitest";
import {
  buildRecallPushPayload,
  indexRecalls,
  matchUserItems,
  nameTokens,
  normMfr,
  tokenOverlap,
  type RecallRow,
  type UserItem,
} from "./match";

const refDate = new Date("2026-05-01T00:00:00.000Z");

function mkItem(overrides: Partial<UserItem> = {}): UserItem {
  return {
    productId: "p1",
    barcode: null,
    name: "신라면 멀티팩",
    manufacturer: "농심",
    lastSeenAt: refDate,
    ...overrides,
  };
}

function mkRecall(overrides: Partial<RecallRow> = {}): RecallRow {
  return {
    id: "r1",
    barcode: null,
    productName: "신라면 멀티팩",
    manufacturer: "농심",
    reason: "이물질 검출",
    grade: null,
    registeredAt: refDate,
    ...overrides,
  };
}

describe("normMfr", () => {
  it("괄호·㈜·주식회사·공백·구두점 모두 제거 후 소문자화", () => {
    expect(normMfr("(주)농심")).toBe("농심");
    expect(normMfr("농심㈜")).toBe("농심");
    expect(normMfr("농심 주식회사")).toBe("농심");
    expect(normMfr("Nongshim Co., Ltd.")).toBe("nongshim");
  });

  it("null/undefined/공백 안전", () => {
    expect(normMfr(null)).toBe("");
    expect(normMfr(undefined)).toBe("");
    expect(normMfr("   ")).toBe("");
  });
});

describe("nameTokens", () => {
  it("2자 이상 토큰만 추출", () => {
    expect(nameTokens("신라면 멀티팩 (5개입)")).toEqual([
      "신라면",
      "멀티팩",
      "5개입",
    ]);
  });
  it("1자 토큰 제거", () => {
    expect(nameTokens("쌀 5kg 햇반")).toEqual(["5kg", "햇반"]);
  });
});

describe("tokenOverlap", () => {
  it("recall 모든 토큰이 product에 포함되면 1.0", () => {
    expect(tokenOverlap("신라면 멀티팩", "농심 신라면 멀티팩 5입")).toBe(1);
  });
  it("absolutely no overlap 0", () => {
    expect(tokenOverlap("진라면", "햇반 컵반")).toBe(0);
  });
  it("부분 일치", () => {
    // recall 토큰 2개 중 1개만 매칭 → 0.5
    expect(tokenOverlap("신라면 멀티팩", "신라면 봉지면")).toBeCloseTo(0.5);
  });
});

describe("matchUserItems", () => {
  it("barcode 정확매칭 시 exact 반환", () => {
    const item = mkItem({ barcode: "8801043015882" });
    const recall = mkRecall({ id: "r-exact", barcode: "8801043015882" });
    const { byBarcode, byMfrNorm } = indexRecalls([recall], new Set(["농심"]));
    const matches = matchUserItems([item], byBarcode, byMfrNorm);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe("exact");
    expect(matches[0].recall.id).toBe("r-exact");
  });

  it("barcode 없는 회수는 제조사+토큰 fallback으로 매칭", () => {
    const item = mkItem({ barcode: null, manufacturer: "(주)농심", name: "신라면 멀티팩 5입" });
    const recall = mkRecall({
      id: "r-fuzzy",
      barcode: null,
      manufacturer: "농심",
      productName: "신라면 멀티팩",
    });
    const { byBarcode, byMfrNorm } = indexRecalls([recall], new Set(["농심"]));
    const matches = matchUserItems([item], byBarcode, byMfrNorm);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe("fuzzy");
    expect(matches[0].score).toBeGreaterThanOrEqual(0.6);
  });

  it("제조사 다르면 fallback 매칭 안 됨", () => {
    const item = mkItem({ barcode: null, manufacturer: "오뚜기" });
    const recall = mkRecall({ barcode: null, manufacturer: "농심" });
    // userMfrNorm에 농심만 있고 사용자는 오뚜기 → fallback 인덱스에 농심만 들어가지만
    // 사용자 아이템은 오뚜기라서 매칭 X
    const { byBarcode, byMfrNorm } = indexRecalls([recall], new Set(["농심"]));
    const matches = matchUserItems([item], byBarcode, byMfrNorm);
    expect(matches).toHaveLength(0);
  });

  it("단일 일반 토큰(2자) 회수명은 같은 제조사 무관 제품에 fuzzy 매칭 안 됨", () => {
    // 회수 "우유"(단일 2자 토큰)가 같은 제조사 "딸기 우유 1L"에 100% 과잉 매칭되던 케이스 방지
    const item = mkItem({ barcode: null, manufacturer: "서울우유", name: "딸기 우유 1L" });
    const recall = mkRecall({
      barcode: null,
      manufacturer: "서울우유",
      productName: "우유",
    });
    const { byBarcode, byMfrNorm } = indexRecalls(
      [recall],
      new Set([normMfr("서울우유")]),
    );
    const matches = matchUserItems([item], byBarcode, byMfrNorm);
    expect(matches).toHaveLength(0);
  });

  it("단일 브랜드성 토큰(3자↑)은 fuzzy 매칭 유지", () => {
    const item = mkItem({ barcode: null, manufacturer: "농심", name: "신라면 멀티팩" });
    const recall = mkRecall({ barcode: null, manufacturer: "농심", productName: "신라면" });
    const { byBarcode, byMfrNorm } = indexRecalls([recall], new Set(["농심"]));
    const matches = matchUserItems([item], byBarcode, byMfrNorm);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe("fuzzy");
  });

  it("토큰 overlap 60% 미만이면 fallback 매칭 안 됨", () => {
    const item = mkItem({ barcode: null, manufacturer: "농심", name: "햇반 컵반" });
    const recall = mkRecall({
      barcode: null,
      manufacturer: "농심",
      productName: "신라면 멀티팩 5입",
    });
    const { byBarcode, byMfrNorm } = indexRecalls([recall], new Set(["농심"]));
    const matches = matchUserItems([item], byBarcode, byMfrNorm);
    expect(matches).toHaveLength(0);
  });

  it("barcode 매칭 우선 — fallback 후보는 무시", () => {
    const item = mkItem({ barcode: "8801043015882", manufacturer: "농심", name: "신라면" });
    const exactRecall = mkRecall({ id: "exact", barcode: "8801043015882" });
    const fuzzyRecall = mkRecall({
      id: "fuzzy",
      barcode: null,
      manufacturer: "농심",
      productName: "신라면 봉지면",
    });
    const { byBarcode, byMfrNorm } = indexRecalls(
      [exactRecall, fuzzyRecall],
      new Set(["농심"]),
    );
    const matches = matchUserItems([item], byBarcode, byMfrNorm);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe("exact");
    expect(matches[0].recall.id).toBe("exact");
  });

  it("같은 사용자 안에서 같은 recall이 중복 매칭되지 않음", () => {
    const item1 = mkItem({ productId: "p1", barcode: null, manufacturer: "농심", name: "신라면 멀티팩" });
    const item2 = mkItem({ productId: "p2", barcode: null, manufacturer: "농심", name: "신라면 컵라면" });
    const recall = mkRecall({ id: "shared", barcode: null, manufacturer: "농심", productName: "신라면" });
    const { byBarcode, byMfrNorm } = indexRecalls([recall], new Set(["농심"]));
    const matches = matchUserItems([item1, item2], byBarcode, byMfrNorm);
    // 첫 item에 매칭되고 두 번째는 같은 recall이라 스킵
    expect(matches).toHaveLength(1);
  });
});

describe("buildRecallPushPayload", () => {
  it("빈 매칭이면 null", () => {
    expect(buildRecallPushPayload([])).toBeNull();
  });

  it("exact가 fuzzy보다 우선 표시", () => {
    const exact = mkRecall({ id: "e1", barcode: "x", productName: "Exact" });
    const fuzzy = mkRecall({ id: "f1", productName: "Fuzzy" });
    const payload = buildRecallPushPayload([
      { item: mkItem({ name: "fuzzyP" }), recall: fuzzy, matchType: "fuzzy", score: 0.7 },
      { item: mkItem({ name: "exactP" }), recall: exact, matchType: "exact" },
    ]);
    expect(payload?.title).toContain("발견");
    expect(payload?.body).toContain("exactP");
  });

  it("fuzzy만 있으면 추정 + 정확도 표기", () => {
    const fuzzy = mkRecall({ id: "f1", productName: "Test" });
    const payload = buildRecallPushPayload([
      { item: mkItem({ name: "테스트제품" }), recall: fuzzy, matchType: "fuzzy", score: 0.75 },
    ]);
    expect(payload?.title).toContain("추정");
    expect(payload?.body).toContain("75%");
  });

  it("매칭 2건 이상이면 본문에 외 N건 표기", () => {
    const r1 = mkRecall({ id: "1" });
    const r2 = mkRecall({ id: "2" });
    const payload = buildRecallPushPayload([
      { item: mkItem({ name: "A" }), recall: r1, matchType: "exact" },
      { item: mkItem({ productId: "p2", name: "B" }), recall: r2, matchType: "exact" },
    ]);
    expect(payload?.body).toContain("외 1건");
  });
});
