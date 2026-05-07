import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
        },
        // 시맨틱 컬러 토큰 (semantic color tokens)
        success: {
          DEFAULT: "#10b981", // emerald-500
          soft: "#d1fae5", // emerald-100
          text: "#047857", // emerald-700
        },
        warning: {
          DEFAULT: "#f59e0b", // amber-500
          soft: "#fef3c7", // amber-100
          text: "#b45309", // amber-700
        },
        danger: {
          DEFAULT: "#f43f5e", // rose-500
          soft: "#ffe4e6", // rose-100
          text: "#be123c", // rose-700
        },
        info: {
          DEFAULT: "#3b82f6", // blue-500
          soft: "#dbeafe", // blue-100
          text: "#1d4ed8", // blue-700
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F0EDE5", // 2차 카드, hover, 비활성 칩
        },
        border: {
          DEFAULT: "#ECE6DA", // 기본 보더 (stone-200 대체)
          strong: "#D6CEBC", // 강조 보더
        },
        // 핸드오프 디자인 토큰 — 기존 stone-X 점진적 대체
        page: "#FAF8F4", // 페이지 배경 (warm white)
        ink: {
          1: "#1B1815", // primary text (stone-900 대체)
          2: "#4A453E", // secondary (stone-600 대체)
          3: "#6F695C", // meta / placeholder (stone-500 대체, AA 통과)
        },
        line: {
          DEFAULT: "#ECE6DA", // border alias
          strong: "#D6CEBC",
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
      },
      // 카드 공중에 살짝 띄우는 톤 — 90년대 평면 표 느낌 탈피용.
      // soft: 정적 카드, raise: hover 강조, ring: focus.
      boxShadow: {
        soft: "0 1px 2px rgba(27,24,21,0.04), 0 2px 8px rgba(27,24,21,0.04)",
        raise: "0 4px 14px rgba(27,24,21,0.08), 0 1px 3px rgba(27,24,21,0.05)",
        ring: "0 0 0 4px rgba(249,115,22,0.18)",
      },
      borderRadius: {
        "2xl": "1rem", // 16px — 모던 카드 표준
        "3xl": "1.25rem", // 20px — 큰 그룹
      },
    },
  },
  plugins: [],
};
export default config;
