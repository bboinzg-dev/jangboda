// 상품 이미지 — Product.imageUrl 노출 + 폴백 처리
// 현재는 <img> 사용 (next/image는 remotePatterns 매번 추가 필요해 비용 큼)
// 추후 next/image로 마이그레이션 가능

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full h-full object-contain"
      />
    </div>
  );
}
