"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "./AuthButton";
import { ThemeToggle } from "./ui/ThemeToggle";

// 데스크톱 nav — 핵심 5개 + 영수증 강조 버튼.
// 가계부는 영수증의 출구이자 핵심 가치 도구이므로 메인 nav에 노출.
const NAV_ITEMS = [
  { href: "/search", label: "상품 검색" },
  { href: "/cart", label: "장보기" },
  { href: "/budget", label: "가계부" },
  { href: "/stores", label: "주변 매장" },
  { href: "/profile", label: "내 정보" },
];

export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="bg-surface/80 backdrop-blur-md border-b border-line/70 sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <span
            className="inline-flex w-8 h-8 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 items-center justify-center text-white font-extrabold text-base shadow-soft group-hover:shadow-raise transition"
            aria-hidden
          >
            장
          </span>
          <span className="font-extrabold text-lg text-ink-1 tracking-tight">
            장보다
          </span>
        </Link>

        {/* 데스크톱 nav */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-lg transition ${
                isActive(item.href)
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "hover:bg-surface-muted text-ink-2 hover:text-ink-1"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/upload"
            className="ml-1 px-3 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 font-semibold inline-flex items-center gap-1.5 shadow-soft hover:shadow-raise transition"
          >
            <span aria-hidden>📸</span>
            <span>영수증</span>
          </Link>

          <ThemeToggle className="ml-1" />

          <span className="ml-1 pl-2 border-l border-line">
            <AuthButton />
          </span>
        </nav>

        {/* 모바일 — 다크 토글 + AuthButton (나머지는 BottomNav) */}
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
