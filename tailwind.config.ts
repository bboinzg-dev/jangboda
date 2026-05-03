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
          DEFAULT: "#ffffff",
          muted: "#fafaf9", // stone-50
        },
        border: {
          DEFAULT: "#e7e5e4", // stone-200
          strong: "#d6d3d1", // stone-300
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
    },
  },
  plugins: [],
};
export default config;
