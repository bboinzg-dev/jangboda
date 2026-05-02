"use client";

import Link from "next/link";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/search", label: "상품 검색" },
  { href: "/cart", label: "장바구니 비교" },
  { href: "/stores", label: "주변 마트" },
  { href: "/sync", label: "동기화" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);

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
              className="px-3 py-2 hover:bg-stone-100 rounded-md"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/upload"
            className="px-3 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 font-medium"
          >
            영수증 올리기
          </Link>
        </nav>

        {/* 모바일 햄버거 + 영수증 버튼 */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            href="/upload"
            className="px-3 py-1.5 bg-brand-500 text-white rounded-md text-sm font-medium"
          >
            📸
          </Link>
          <button
            onClick={() => setOpen(!open)}
            aria-label="메뉴 열기"
            className="p-2 hover:bg-stone-100 rounded-md"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              {open ? (
                <path d="M4 4l12 12M16 4l-12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* 모바일 메뉴 드롭 */}
      {open && (
        <nav className="md:hidden border-t border-stone-200 bg-white">
          <div className="max-w-5xl mx-auto px-4 py-2 flex flex-col">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-2 px-2 hover:bg-stone-100 rounded-md text-sm"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/contribute"
              onClick={() => setOpen(false)}
              className="py-2 px-2 hover:bg-stone-100 rounded-md text-sm text-stone-600"
            >
              가격 직접 입력
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
