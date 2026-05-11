"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./Icons";

// 다크모드 토글 — localStorage 영속화.
// FOUC 방지 스크립트는 layout.tsx의 <head>에서 실행됨.
const STORAGE_KEY = "jb-theme";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return (document.documentElement.classList.contains("dark") ? "dark" : "light");
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getInitialTheme());
    setMounted(true);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 시크릿/스토리지 차단 — 무시
    }
  };

  // SSR/CSR 미스매치 방지 — 마운트 전엔 placeholder만
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={isDark ? "라이트 모드" : "다크 모드"}
      className={[
        "inline-flex items-center justify-center w-9 h-9 rounded-lg",
        "border border-line bg-surface text-ink-2 hover:bg-surface-muted hover:text-ink-1",
        "transition",
        className,
      ].join(" ")}
    >
      {mounted ? (isDark ? <SunIcon size={17} /> : <MoonIcon size={17} />) : <MoonIcon size={17} />}
    </button>
  );
}
