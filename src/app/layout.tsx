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
  // 60대 사용자가 글씨 확대해서 볼 수 있도록 pinch zoom 제한 해제
  userScalable: true,
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
  // 아이콘/OG는 Next.js App Router convention 자동 처리:
  //   src/app/icon.png → favicon
  //   src/app/apple-icon.png → apple-touch-icon
  //   src/app/opengraph-image.png → og:image
  //   src/app/twitter-image.png → twitter:image
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/*
          Pretendard 폰트 로드 (CDN 방식)
          - public/fonts 에 폰트 파일을 두지 않고 jsDelivr CDN을 사용
          - next/font/local 대신 CDN을 채택한 이유: 폰트 파일 관리 부담 제거
          - Tailwind의 font-pretendard 유틸리티와 함께 동작
        */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-screen font-pretendard">
        <FavoritesProvider>
          <Nav />
          <main className="max-w-5xl mx-auto px-4 py-6 pb-24 md:pb-6">{children}</main>
          <BottomNav />
          <InstallPrompt />
        </FavoritesProvider>
        <footer className="border-t border-line mt-12 py-6 text-center text-sm text-ink-3 px-4 space-y-2">
          <div>장보다 — 사용자 기여로 만들어지는 마트 가격 비교 플랫폼</div>
          <div className="text-xs">
            데이터 출처: KAMIS · 네이버 쇼핑 · 한국소비자원 · 식약처 · GOV24 · 사용자 영수증
          </div>
          <div className="text-xs">
            <a href="/legal/privacy" className="hover:underline">개인정보처리방침</a>
            <span className="mx-2">·</span>
            <span>외부 데이터는 참고용이며 정확한 정보는 해당 기관에서 확인하세요</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
