"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "./AuthButton";

// 데스크톱 nav — 핵심 4개 + 영수증 강조 버튼
// 정부 혜택은 홈 카드로, 가계부·AI 증명사진·동기화는 /profile 도구함으로 이동
const NAV_ITEMS = [
  { href: "/search", label: "상품 검색" },
  { href: "/cart", label: "장보기" },
  { href: "/stores", label: "주변 매장" },
  { href: "/profile", label: "내 정보" },
];

export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="bg-white border-b border-stone-200 sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-2xl">🛒</span>
          <span className="font-bold text-lg text-brand-700">장보다</span>
        </Link>

        {/* 데스크톱 nav */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-2 rounded-md ${
                isActive(item.href)
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "hover:bg-stone-100 text-stone-700"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/upload"
            className="ml-1 px-3 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 font-medium inline-flex items-center gap-1"
          >
            <span>📸</span>
            <span>영수증</span>
          </Link>

          <span className="ml-1 pl-2 border-l border-stone-200">
            <AuthButton />
          </span>
        </nav>

        {/* 모바일 — 영수증 + AuthButton만 (나머지는 BottomNav) */}
        <div className="flex md:hidden items-center gap-2">
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
