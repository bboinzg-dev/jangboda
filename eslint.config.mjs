// ESLint flat config — Next.js 16부터 `next lint` 가 사라져 직접 eslint 호출.
// eslint-config-next@16은 이미 flat config 배열을 export하므로 spread만으로 사용 가능.
import next from "eslint-config-next";

const TAILWIND_HARDCODED_COLOR_PATTERN =
  "Literal[value=/(?:^|[\\s'\"`])(?:bg-white|bg-stone-\\d{2,3}|text-stone-\\d{2,3}|border-stone-\\d{2,3}|bg-(?:amber|emerald|rose|red|blue|sky)-(?:50|100|200|300|400|500|600|700|800|900)|text-(?:amber|emerald|rose|red|blue|sky)-(?:300|400|500|600|700|800|900))(?:[\\s'\"`]|$)/]";

export default [
  // Playwright/빌드 결과/외부 의존 경로 무시
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "e2e/**",
      "*.config.mjs",
      "*.config.ts",
    ],
  },

  // Next.js core-web-vitals 룰셋
  ...next,

  // 프로젝트 룰
  {
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: TAILWIND_HARDCODED_COLOR_PATTERN,
          message:
            "하드코딩 색 대신 시맨틱 토큰 사용: bg-surface, text-ink-{1..4}, bg-{success|warning|danger|info}-soft, text-{success|warning|danger|info}-text. (admin 다크 헤더 bg-stone-900은 의도된 예외)",
        },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // ESLint 9 + react-hooks@7의 새 룰들 — 기존 코드와 충돌. 점진 정리 위해 warn으로 다운그레이드.
      // (Next 16 업그레이드 시 신설된 룰들이라 일괄 수정은 별도 정리 라운드에서)
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },

  // observability.ts는 console 직접 호출이 본문(noop sink + Sentry 위임)
  {
    files: ["src/lib/observability.ts"],
    rules: { "no-console": "off" },
  },
];
