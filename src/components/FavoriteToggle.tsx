"use client";

import { useEffect, useState } from "react";
import { createClient, isAuthConfigured } from "@/lib/supabase/client";

type Props = {
  storeId: string;
  size?: "sm" | "md";
  /** 부모 Link 클릭과 분리하려면 true */
  stopPropagation?: boolean;
};

// 즐겨찾기 매장 토글 — 매장 카드/상세에 통합
export default function FavoriteToggle({
  storeId,
  size = "md",
  stopPropagation,
}: Props) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!isAuthConfigured()) {
      setLoading(false);
      return;
    }
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => {
      const isAuthed = !!data.user;
      setAuthed(isAuthed);
      if (!isAuthed) {
        setLoading(false);
        return;
      }
      // 내 즐겨찾기 목록에 storeId 있는지
      fetch("/api/favorites")
        .then((r) => r.json())
        .then((d) => {
          const favs: Array<{ storeId: string }> = d.favorites ?? [];
          setEnabled(favs.some((f) => f.storeId === storeId));
        })
        .finally(() => setLoading(false));
    });
  }, [storeId]);

  if (!isAuthConfigured() || !authed) return null;

  async function toggle(e: React.MouseEvent) {
    if (stopPropagation) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (loading) return;
    setLoading(true);
    try {
      if (enabled) {
        await fetch(`/api/favorites?storeId=${storeId}`, { method: "DELETE" });
        setEnabled(false);
      } else {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId }),
        });
        setEnabled(true);
      }
    } finally {
      setLoading(false);
    }
  }

  const dim = size === "sm" ? "text-base" : "text-xl";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      aria-label={enabled ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      className={`${dim} ${enabled ? "text-amber-400" : "text-stone-300 hover:text-amber-400"} disabled:opacity-50 leading-none transition-colors`}
      title={enabled ? "즐겨찾기 해제" : "즐겨찾기 추가"}
    >
      {enabled ? "★" : "☆"}
    </button>
  );
}
