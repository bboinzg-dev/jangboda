"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { createClient, isAuthConfigured } from "@/lib/supabase/client";

type Ctx = {
  authed: boolean;
  ready: boolean;
  ids: Set<string>;
  toggle: (storeId: string) => Promise<void>;
};

const FavoritesContext = createContext<Ctx | null>(null);

// 페이지 안에서 한 번만 /api/favorites fetch — 모든 FavoriteToggle이 공유
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthConfigured()) {
      setReady(true);
      return;
    }
    let cancelled = false;
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      if (!data.user) {
        setReady(true);
        return;
      }
      setAuthed(true);
      fetch("/api/favorites")
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          const next = new Set<string>(
            (d.favorites ?? []).map((f: { storeId: string }) => f.storeId)
          );
          setIds(next);
        })
        .catch(() => {})
        .finally(() => {
          if (cancelled) return;
          setReady(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async (storeId: string) => {
    // optimistic update
    const willAdd = !ids.has(storeId);
    setIds((prev) => {
      const next = new Set(prev);
      if (willAdd) next.add(storeId);
      else next.delete(storeId);
      return next;
    });

    try {
      if (willAdd) {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId }),
        });
      } else {
        await fetch(`/api/favorites?storeId=${storeId}`, { method: "DELETE" });
      }
    } catch {
      // rollback
      setIds((prev) => {
        const next = new Set(prev);
        if (willAdd) next.delete(storeId);
        else next.add(storeId);
        return next;
      });
    }
  }, [ids]);

  return (
    <FavoritesContext.Provider value={{ authed, ready, ids, toggle }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): Ctx {
  const ctx = useContext(FavoritesContext);
  if (!ctx) {
    // Provider 없는 곳에서도 동작 (비활성 상태로)
    return {
      authed: false,
      ready: true,
      ids: new Set(),
      toggle: async () => {},
    };
  }
  return ctx;
}
