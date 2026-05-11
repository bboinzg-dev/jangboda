import type { Config } from "tailwindcss";

// 디자인 핸드오프 v1 — Editorial Grocer.
// 색은 globals.css의 CSS 변수(RGB triplet)를 참조 → opacity modifier (text-ink-1/70) 지원.
// 다크모드는 <html class="dark"> 토글로 활성화.
const withAlpha = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 브랜드 50~400은 정적 (디자인 토큰 그대로). 500/600은 변수 — 다크에서 보정됨.
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: withAlpha("--brand"),
          600: withAlpha("--brand-hover"),
          700: "#c2410c",
          soft: withAlpha("--brand-soft"),
          ink: withAlpha("--brand-ink"),
          DEFAULT: withAlpha("--brand"),
        },
        success: {
          DEFAULT: withAlpha("--success"),
          soft: withAlpha("--success-soft"),
          text: withAlpha("--success-text"),
        },
        warning: {
          DEFAULT: withAlpha("--warning"),
          soft: withAlpha("--warning-soft"),
          text: withAlpha("--warning-text"),
        },
        danger: {
          DEFAULT: withAlpha("--danger"),
          soft: withAlpha("--danger-soft"),
          text: withAlpha("--danger-text"),
        },
        info: {
          DEFAULT: withAlpha("--info"),
          soft: withAlpha("--info-soft"),
          text: withAlpha("--info-text"),
        },
        surface: {
          DEFAULT: withAlpha("--surface"),
          muted: withAlpha("--surface-muted"),
          sunken: withAlpha("--surface-sunken"),
        },
        page: withAlpha("--page"),
        ink: {
          1: withAlpha("--ink-1"),
          2: withAlpha("--ink-2"),
          3: withAlpha("--ink-3"),
          4: withAlpha("--ink-4"),
        },
        line: {
          DEFAULT: withAlpha("--line"),
          strong: withAlpha("--line-strong"),
        },
        border: {
          DEFAULT: withAlpha("--line"),
          strong: withAlpha("--line-strong"),
        },
      },
      fontFamily: {
        pretendard: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Apple SD Gothic Neo"',
          '"Malgun Gothic"',
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(27,24,21,0.04), 0 2px 8px rgba(27,24,21,0.04)",
        raise: "0 4px 14px rgba(27,24,21,0.08), 0 1px 3px rgba(27,24,21,0.05)",
        pop: "0 12px 32px rgba(27,24,21,0.12), 0 2px 6px rgba(27,24,21,0.06)",
        ring: "0 0 0 4px rgba(249,115,22,0.18)",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
      fontSize: {
        "kpi-hero": ["38px", { lineHeight: "1", letterSpacing: "-1px", fontWeight: "800" }],
        "kpi": ["26px", { lineHeight: "1.1", letterSpacing: "-0.5px", fontWeight: "700" }],
      },
    },
  },
  plugins: [],
};
export default config;
