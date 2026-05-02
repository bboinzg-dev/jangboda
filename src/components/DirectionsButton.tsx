type Props = {
  name: string;
  lat: number;
  lng: number;
};

// 카카오맵 길찾기 deep link — 모바일에서 카카오맵 앱이 있으면 앱이 열리고 없으면 웹
export default function DirectionsButton({ name, lat, lng }: Props) {
  const url = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-stone-200 bg-white hover:bg-stone-50 active:bg-stone-100 text-stone-700"
      aria-label={`${name} 길찾기`}
    >
      <span aria-hidden>🚶</span>
      <span>길찾기</span>
    </a>
  );
}
