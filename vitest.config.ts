// vitest 설정 — node 환경에서 핵심 도메인 로직(KST·matcher·budgetCategory) 단위 테스트
// next/prisma/supabase 같은 런타임 의존이 큰 코드는 mock 비용이 커서 일단 제외 (E2E 별도)
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/db.ts", "src/lib/supabase/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
