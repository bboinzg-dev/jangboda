// 가계부 메가 카테고리 분류 — 영수증 OCR 결과로 자주 들어오는 케이스 위주로 검증
// 회귀 시 사용자가 직접 발견(잘못된 카테고리에서 자기 지출 사라짐)하므로 테스트 가치 큼
import { describe, expect, it } from "vitest";
import { budgetCategoryOf } from "./budgetCategory";

describe("budgetCategoryOf", () => {
  it("우유·치즈는 유제품", () => {
    expect(budgetCategoryOf("서울우유 1L")).toBe("유제품");
    expect(budgetCategoryOf("서울 체다치즈")).toBe("유제품");
  });

  it("돼지고기·계란은 신선식품", () => {
    expect(budgetCategoryOf("돼지고기 삼겹살")).toBe("신선식품");
    expect(budgetCategoryOf("계란 30구")).toBe("신선식품");
    expect(budgetCategoryOf("청송 사과 5kg")).toBe("신선식품");
  });

  it("라면·즉석밥은 가공·즉석식품", () => {
    expect(budgetCategoryOf("농심 신라면 멀티팩")).toBe("가공·즉석식품");
    expect(budgetCategoryOf("CJ 햇반 백미")).toBe("가공·즉석식품");
  });

  it("탄산·생수는 음료", () => {
    expect(budgetCategoryOf("코카콜라 500ml")).toBe("음료");
    expect(budgetCategoryOf("삼다수 2L")).toBe("음료");
  });

  it("맥주·소주는 주류", () => {
    expect(budgetCategoryOf("카스 맥주 500ml")).toBe("주류");
    expect(budgetCategoryOf("참이슬 360ml")).toBe("주류");
  });

  it("휴지·세제는 생활용품", () => {
    expect(budgetCategoryOf("크리넥스 화장지 30롤")).toBe("생활용품");
    expect(budgetCategoryOf("퍼실 세제 4L")).toBe("생활용품");
  });

  it("productCategory가 의미있으면 우선 사용", () => {
    expect(budgetCategoryOf("뭐가 됐든", "유제품")).toBe("유제품");
    expect(budgetCategoryOf("뭐가 됐든", "라면/면류")).toBe("가공·즉석식품");
  });

  it("'참가격 등록 상품' 같은 메타 카테고리는 무시하고 이름으로 분류", () => {
    expect(budgetCategoryOf("우유 1L", "참가격 등록 상품")).toBe("유제품");
    expect(budgetCategoryOf("사용자등록", "사용자 등록")).toBe("기타");
  });

  it("매칭 안 되면 기타", () => {
    expect(budgetCategoryOf("xxxxxxxx-알 수 없는 상품")).toBe("기타");
  });
});
