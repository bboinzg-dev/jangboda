/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      // 네이버 쇼핑 썸네일 — Product.imageUrl로 저장되는 호스트
      { protocol: "https", hostname: "shopping-phinf.pstatic.net" },
    ],
  },
  async headers() {
    // CSP는 인라인 스크립트(Next.js inline runtime, PostHog snippet, 다크모드 FOUC 방지)·
    // 카카오/네이버/Supabase/Sentry 호스트를 허용해야 해서 상대적으로 느슨함.
    // 외부 폼 액션·iframe 차단으로 클릭재킹·폼하이재킹은 막힘.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://dapi.kakao.com https://*.posthog.com https://*.sentry.io",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://cdn.jsdelivr.net",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), interest-cohort=()" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
