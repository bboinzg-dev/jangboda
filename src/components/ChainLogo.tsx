// Chain 로고 표시 — 작은 인라인 이미지.
// src가 null/undefined/빈 문자열이면 아무것도 렌더하지 않아 chainName 텍스트만 보임.
// next/image로 마이그레이션됨. SVG는 unoptimized로 처리 (next/image 최적화 비호환)

import Image from "next/image";

type Props = {
  src: string | null | undefined;
  name: string;
  size?: number; // 픽셀 단위, default 24
  className?: string;
};

export default function ChainLogo({ src, name, size = 24, className }: Props) {
  if (!src) {
    return null; // 로고 없으면 미표시 (chain name 텍스트로 충분)
  }
  return (
    <Image
      src={src}
      alt={name}
      width={size}
      height={size}
      unoptimized={src.endsWith(".svg")}
      className={`shrink-0 object-contain ${className ?? ""}`}
    />
  );
}
