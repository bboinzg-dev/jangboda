import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "장보다 — 우리 동네 마트 가격 비교",
  description: "롯데마트, 킴스클럽, 이마트 등 주변 마트의 실제 가격을 비교하세요",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <header className="bg-white border-b border-stone-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">🛒</span>
              <span className="font-bold text-lg text-brand-700">장보다</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/search"
                className="px-3 py-2 hover:bg-stone-100 rounded-md"
              >
                상품 검색
              </Link>
              <Link
                href="/cart"
                className="px-3 py-2 hover:bg-stone-100 rounded-md"
              >
                장바구니 비교
              </Link>
              <Link
                href="/stores"
                className="px-3 py-2 hover:bg-stone-100 rounded-md"
              >
                주변 마트
              </Link>
              <Link
                href="/sync"
                className="px-3 py-2 hover:bg-stone-100 rounded-md"
              >
                동기화
              </Link>
              <Link
                href="/upload"
                className="px-3 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600"
              >
                영수증 올리기
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
        <footer className="border-t border-stone-200 mt-12 py-6 text-center text-xs text-stone-500">
          🛒 장보다 — 사용자 기여로 만들어지는 마트 가격 비교 플랫폼
        </footer>
      </body>
    </html>
  );
}
