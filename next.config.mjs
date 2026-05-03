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
};

export default nextConfig;
