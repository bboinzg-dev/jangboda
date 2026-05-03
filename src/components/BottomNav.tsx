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
      className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-border md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="하단 네비게이션"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((t) => {
          const active = isActive(t.href);
          if (t.primary) {
            return (
              <li key={t.href} className="flex justify-center -mt-4">
                <Link
                  href={t.href}
                  className="bg-brand-500 hover:bg-brand-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg text-xl"
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
                className={`flex flex-col items-center justify-center py-2 text-[11px] ${
                  active ? "text-brand-600" : "text-stone-500"
                }`}
              >
                <span className="text-xl leading-none mb-0.5">{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
