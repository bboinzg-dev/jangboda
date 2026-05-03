"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ShoppingItem = {
  productId: string;
  name: string;
  brand?: string | null;
  unit?: string | null;
  quantity: number;
};

type Props = {
  items: ShoppingItem[];
  onClose: () => void;
};

// 마트에서 한 손으로 보면서 체크하는 풀스크린 모드.
// 체크 상태는 cart 구성(productId 조합) 기준으로 localStorage에 저장 — cart가 바뀌면 자동 리셋.
// 큰 글씨 + 큰 체크 버튼 + 화면 꺼짐 방지.
export default function ShoppingMode({ items, onClose }: Props) {
  // cart 구성 해시 — 정렬해서 결정적
  const cartHash = useMemo(
    () =>
      items
        .map((i) => `${i.productId}x${i.quantity}`)
        .sort()
        .join("|"),
    [items]
  );
  const storageKey = `jangboda:shopping:${cartHash}`;

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // localStorage 로드 (mount 시 1회)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setChecked(new Set(arr.filter((x) => typeof x === "string")));
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, [storageKey]);

  // 변경분 저장
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...checked]));
    } catch {
      // ignore (quota 등)
    }
  }, [checked, hydrated, storageKey]);

  // 화면 꺼짐 방지 (마트 돌아다니면서 보기)
  useEffect(() => {
    let active = true;
    const w = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
    };
    if (w.wakeLock?.request) {
      w.wakeLock
        .request("screen")
        .then((lock) => {
          if (!active) {
            lock.release().catch(() => {});
            return;
          }
          wakeLockRef.current = lock;
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, []);

  // body 스크롤 잠금 (모드 동안)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const toggle = (productId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const reset = () => {
    if (confirm("진행 상황을 모두 초기화할까요?")) setChecked(new Set());
  };

  const done = checked.size;
  const total = items.length;
  const allDone = total > 0 && done === total;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="장보기 진행"
    >
      {/* 상단 sticky 헤더 — 진행률 + 닫기 */}
      <div className="sticky top-0 bg-stone-900/95 backdrop-blur border-b border-stone-700 px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-2 max-w-xl mx-auto">
          <div className="text-white text-base font-bold">
            🛒 장보기 진행 ({done}/{total})
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-3xl px-2 -mr-2 leading-none"
            aria-label="장보기 종료"
          >
            ×
          </button>
        </div>
        <div className="w-full bg-stone-700 rounded-full h-2 max-w-xl mx-auto overflow-hidden">
          <div
            className="bg-success h-full rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* 항목 리스트 — 큰 카드 */}
      <ul className="p-4 max-w-xl mx-auto space-y-3 pb-32">
        {items.map((it) => {
          const isChecked = checked.has(it.productId);
          return (
            <li key={it.productId}>
              <button
                type="button"
                onClick={() => toggle(it.productId)}
                className={`w-full text-left rounded-2xl p-5 flex items-center gap-4 transition active:scale-[0.98] ${
                  isChecked
                    ? "bg-stone-800 border border-stone-700"
                    : "bg-white border border-border shadow-sm"
                }`}
              >
                <span
                  className={`shrink-0 w-14 h-14 rounded-full flex items-center justify-center text-3xl transition ${
                    isChecked
                      ? "bg-success text-white"
                      : "bg-stone-100 border-2 border-stone-300 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-xl font-bold leading-tight ${
                      isChecked ? "text-stone-500 line-through" : "text-stone-900"
                    }`}
                  >
                    {it.name}
                  </div>
                  {(it.brand || it.unit) && (
                    <div
                      className={`text-sm mt-1 ${
                        isChecked ? "text-stone-600" : "text-stone-500"
                      }`}
                    >
                      {[it.brand, it.unit].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <div
                  className={`shrink-0 text-2xl font-bold ${
                    isChecked ? "text-stone-500" : "text-stone-700"
                  }`}
                >
                  ×{it.quantity}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 완료 시 축하 + 종료 */}
      {allDone && (
        <div className="fixed bottom-0 left-0 right-0 bg-stone-900 border-t border-stone-700 p-4 pb-6 text-center">
          <div className="text-4xl mb-1">🎉</div>
          <div className="text-white text-lg font-bold mb-3">
            장보기 완료! 수고하셨어요
          </div>
          <button
            onClick={onClose}
            className="bg-success hover:opacity-90 text-white px-8 py-3 rounded-full text-lg font-bold w-full max-w-xs"
          >
            돌아가기
          </button>
        </div>
      )}

      {/* 미완료 — 작은 초기화 버튼 (실수 복구용) */}
      {!allDone && done > 0 && (
        <div className="fixed bottom-4 right-4">
          <button
            type="button"
            onClick={reset}
            className="text-xs text-stone-400 hover:text-stone-200 bg-stone-800/80 backdrop-blur px-3 py-2 rounded-full"
          >
            진행 초기화
          </button>
        </div>
      )}
    </div>
  );
}
