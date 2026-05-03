// Chain 로고 표시 — 작은 인라인 이미지.
// src가 null/undefined/빈 문자열이면 아무것도 렌더하지 않아 chainName 텍스트만 보임.
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
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      className={`shrink-0 object-contain ${className ?? ""}`}
      style={{ width: size, height: size }}
    />
  );
}
