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
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={enabled ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      className={`${dim} ${enabled ? "text-warning" : "text-stone-300 hover:text-warning"} leading-none transition-colors`}
      title={enabled ? "즐겨찾기 해제" : "즐겨찾기 추가"}
    >
      {enabled ? "★" : "☆"}
    </button>
  );
}
