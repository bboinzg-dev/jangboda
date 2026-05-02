import type { Metadata, Viewport } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import BottomNav from "@/components/BottomNav";
import InstallPrompt from "@/components/InstallPrompt";
import { FavoritesProvider } from "@/components/FavoritesProvider";

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://jangboda.vercel.app"),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "장보다",
  },
  title: "장보다 — 우리 동네 마트 가격 비교",
  description:
    "롯데마트, 킴스클럽, 이마트와 쿠팡, G마켓, SSG 등 온라인 쇼핑몰 가격을 한 화면에서 비교하세요. 영수증 한 장으로 동네 이웃 모두가 절약합니다.",
  keywords: ["마트 가격비교", "장보기", "롯데마트", "이마트", "쿠팡", "온라인 최저가"],
  openGraph: {
    title: "장보다 — 우리 동네 마트 가격 비교",
    description: "오프라인 마트 + 온라인 쇼핑몰 가격을 한 번에 비교",
    type: "website",
    locale: "ko_KR",
    siteName: "장보다",
  },
  twitter: {
    card: "summary",
    title: "장보다 — 우리 동네 마트 가격 비교",
    description: "오프라인 마트 + 온라인 쇼핑몰 가격을 한 번에 비교",
  },
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='0.9em' font-size='80'%3E🛒%3C/text%3E%3C/svg%3E",
        type: "image/svg+xml",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <FavoritesProvider>
          <Nav />
          <main className="max-w-5xl mx-auto px-4 py-6 pb-24 md:pb-6">{children}</main>
          <BottomNav />
          <InstallPrompt />
        </FavoritesProvider>
        <footer className="border-t border-stone-200 mt-12 py-6 text-center text-xs text-stone-500 px-4">
          🛒 장보다 — 사용자 기여로 만들어지는 마트 가격 비교 플랫폼
          <br />
          데이터 출처: KAMIS 공공API · 네이버 쇼핑 · 사용자 영수증
        </footer>
      </body>
    </html>
  );
}
