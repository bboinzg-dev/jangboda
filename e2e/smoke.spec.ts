// 핵심 페이지가 500/404 없이 로드되고, 검색·네비게이션 같은 기본 UX가
// 회귀 없이 동작하는지 확인하는 smoke 테스트.
// 신규 페이지가 무거운 SSR로 빠지면 여기에서 곧장 잡힌다.
import { test, expect } from "@playwright/test";

test.describe("홈/카탈로그 smoke", () => {
  test("홈은 200으로 응답하고 제목이 '장보다'를 포함한다", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/장보다/);
  });

  test("/recipes 페이지에 검색 input과 aria-label이 있다", async ({ page }) => {
    await page.goto("/recipes");
    const searchInput = page.getByRole("textbox", { name: /레시피 검색/ });
    await expect(searchInput).toBeVisible();
  });

  test("/parsa 페이지에 검색 input과 aria-label이 있다", async ({ page }) => {
    await page.goto("/parsa");
    const searchInput = page.getByRole("textbox", { name: /상품명 검색/ });
    await expect(searchInput).toBeVisible();
  });

  test("/legal/privacy 정적 페이지는 콘텐츠를 렌더링한다", async ({ page }) => {
    const response = await page.goto("/legal/privacy");
    expect(response?.status()).toBe(200);
    // generateMetadata로 등록된 title 또는 root layout title이라도 떠야 함
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("동적 페이지 메타데이터", () => {
  test("/sitemap.xml 은 200 + xml content-type", async ({ page }) => {
    const response = await page.request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/xml/);
  });

  test("/robots.txt 는 200 + 기본 내용 포함", async ({ page }) => {
    const response = await page.request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toMatch(/User-agent/i);
  });
});
