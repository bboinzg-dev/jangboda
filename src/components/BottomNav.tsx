"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/search", label: "검색", icon: "🔍" },
  { href: "/upload", label: "영수증", icon: "📸", primary: true },
  { href: "/stores", label: "매장", icon: "📍" },
  { href: "/profile", label: "나", icon: "👤" },
];

// 모바일 전용 하단 탭 바 — 핵심 액션 항상 노출
export default function BottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur-md border-t border-line/70 md:hidden shadow-[0_-2px_8px_rgba(27,24,21,0.04)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="하단 네비게이션"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = isActive(t.href);
          if (t.primary) {
            return (
              <li key={t.href} className="flex justify-center -mt-5">
                <Link
                  href={t.href}
                  className="bg-gradient-to-br from-brand-400 to-brand-600 hover:from-brand-500 hover:to-brand-700 text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-raise text-xl ring-4 ring-white/80 transition"
                  aria-label={t.label}
                >
                  {t.icon}
                </Link>
              </li>
            );
          }
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center justify-center py-2 text-[11px] transition ${
                  active
                    ? "text-brand-600 font-semibold"
                    : "text-ink-3 hover:text-ink-2"
                }`}
              >
                <span className="text-xl leading-none mb-0.5" aria-hidden>
                  {t.icon}
                </span>
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
