// 상품 이미지 — Product.imageUrl 노출 + 폴백 처리
// next/image로 마이그레이션됨: 자동 lazy loading + AVIF/WebP 변환 + 적절한 sizing
// 외부 도메인은 next.config.mjs의 remotePatterns에서 허용

import Image from "next/image";

type Props = {
  src: string | null | undefined;
  alt: string;
  size?: number; // 픽셀 단위, 기본 64
  className?: string;
};

export default function ProductImage({ src, alt, size = 64, className }: Props) {
  if (!src) {
    return (
      <div
        className={`shrink-0 rounded-md bg-stone-100 flex items-center justify-center text-stone-300 ${className ?? ""}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        🛒
      </div>
    );
  }
  return (
    <div
      className={`shrink-0 rounded-md overflow-hidden bg-stone-50 ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="w-full h-full object-contain"
      />
    </div>
  );
}
