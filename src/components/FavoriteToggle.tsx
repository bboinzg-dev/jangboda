"use client";

import { useFavorites } from "./FavoritesProvider";

type Props = {
  storeId: string;
  size?: "sm" | "md";
  /** 부모 Link 클릭과 분리하려면 true */
  stopPropagation?: boolean;
};

// 즐겨찾기 매장 토글 — FavoritesProvider 컨텍스트 사용 (페이지당 1회 fetch)
export default function FavoriteToggle({
  storeId,
  size = "md",
  stopPropagation,
}: Props) {
  const { authed, ready, ids, toggle } = useFavorites();

  if (!ready || !authed) return null;

  const enabled = ids.has(storeId);

  function handleClick(e: React.MouseEvent) {
    if (stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    toggle(storeId);
  }

  const dim = size === "sm" ? "text-base" : "text-xl";
  // 아이콘은 작아도 누를 영역은 44px — 모바일 터치 타깃 기준
  // inline-flex + min-h/w로 시각 크기는 유지하면서 hit area만 확장
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={enabled ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      aria-pressed={enabled}
      className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] ${dim} ${enabled ? "text-warning" : "text-stone-300 hover:text-warning"} leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 rounded`}
      title={enabled ? "즐겨찾기 해제" : "즐겨찾기 추가"}
    >
      {enabled ? "★" : "☆"}
    </button>
  );
}
