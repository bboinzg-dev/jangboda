"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconCart, IconStore } from "@/components/icons";

export type ShoppingItem = {
  productId: string;
  name: string;
  brand?: string | null;
  unit?: string | null;
  quantity: number;
  /** 매장 그룹화 — 같은 storeName끼리 묶어서 보여줌 */
  storeName?: string | null;
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
  // 0/0 NaN guard — 빈 카트일 때 분모가 0
  const allDone = total > 0 && done === total;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  // 매장 그룹화 — storeName 있을 때만 묶음, 없으면 단일 그룹
  const groups = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const it of items) {
      const key = it.storeName ?? "";
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    return Array.from(map.entries()).map(([storeName, list]) => ({
      storeName,
      list,
    }));
  }, [items]);

  // 빈 카트 가드 — 모달 자체는 띄워주지만 emptystate 안내
  if (total === 0) {
    return (
      <div
        className="fixed inset-0 z-50 bg-stone-900 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="장보기 진행"
      >
        <div className="sticky top-0 bg-stone-900/95 backdrop-blur border-b border-stone-700 px-4 py-3">
          <div className="flex items-center justify-between gap-2 max-w-xl mx-auto">
            <div className="text-white text-base font-bold inline-flex items-center gap-2">
              <IconCart size={20} className="text-white" />
              장보기 진행
            </div>
            <button
              onClick={onClose}
              className="text-white/70 hover:text-white text-3xl px-2 -mr-2 leading-none"
              aria-label="장보기 종료"
            >
              ×
            </button>
          </div>
        </div>
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <div className="text-white text-lg font-bold mb-2">
            장바구니가 비어 있어요
          </div>
          <p className="text-stone-400 text-sm mb-6">
            상품을 먼저 담은 뒤 장보기 모드를 시작하세요
          </p>
          <button
            onClick={onClose}
            className="bg-white text-stone-900 px-6 py-3 rounded-full text-base font-bold"
          >
            돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="장보기 진행"
    >
      {/* 상단 sticky 헤더 — 큰 진행률 + 닫기 */}
      <div className="sticky top-0 bg-stone-900/95 backdrop-blur border-b border-stone-700 px-4 py-4">
        <div className="flex items-start justify-between gap-3 max-w-xl mx-auto">
          <div className="min-w-0 flex-1">
            <div className="text-white/60 text-xs mb-0.5 inline-flex items-center gap-1">
              <IconCart size={12} className="text-white/60" />
              장보기 진행
            </div>
            {/* "X / Y 완료" 큰 숫자 hero */}
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-extrabold tabular-nums tracking-tight text-white leading-none">
                {done}
              </span>
              <span className="text-white/60 text-base font-semibold tabular-nums">
                / {total}
              </span>
              <span className="text-white/60 text-sm ml-1">완료</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white text-3xl px-2 -mr-2 leading-none shrink-0"
            aria-label="장보기 종료"
          >
            ×
          </button>
        </div>
        {/* 큰 진행 바 */}
        <div className="mt-3 max-w-xl mx-auto">
          <div className="w-full bg-stone-700 rounded-full h-3 overflow-hidden">
            <div
              className="bg-success h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-1 text-right text-[11px] text-white/50 tabular-nums">
            {progressPct}%
          </div>
        </div>
      </div>

      {/* 항목 리스트 — 매장 그룹화 + 큰 카드 */}
      <div className="p-4 max-w-xl mx-auto space-y-5 pb-32">
        {groups.map((group, gi) => {
          const groupDone = group.list.filter((it) =>
            checked.has(it.productId)
          ).length;
          return (
            <div key={`${group.storeName}-${gi}`} className="space-y-3">
              {group.storeName && (
                <div className="flex items-center gap-2 text-white/80 text-sm font-bold px-1">
                  <IconStore size={16} className="text-white/80" />
                  <span>
                    {group.storeName}에서 살 것 {group.list.length}개
                  </span>
                  <span className="text-white/50 font-normal text-xs ml-auto tabular-nums">
                    {groupDone}/{group.list.length}
                  </span>
                </div>
              )}
              <ul className="space-y-3">
                {group.list.map((it) => {
                  const isChecked = checked.has(it.productId);
                  return (
                    <li key={it.productId}>
                      <button
                        type="button"
                        onClick={() => toggle(it.productId)}
                        className={`w-full text-left rounded-2xl p-5 flex items-center gap-4 transition active:scale-[0.98] ${
                          isChecked
                            ? "bg-stone-800 border border-stone-700"
                            : "bg-white border border-line shadow-sm"
                        }`}
                      >
                        <span
                          className={`shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                            isChecked
                              ? "bg-success border-2 border-success scale-110"
                              : "bg-stone-100 border-2 border-line-strong"
                          }`}
                        >
                          {isChecked && (
                            <IconCheck size={32} className="text-white" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-xl font-bold leading-tight ${
                              isChecked
                                ? "text-stone-500 line-through"
                                : "text-ink-1"
                            }`}
                          >
                            {it.name}
                          </div>
                          {(it.brand || it.unit) && (
                            <div
                              className={`text-sm mt-1 ${
                                isChecked ? "text-stone-600" : "text-ink-3"
                              }`}
                            >
                              {[it.brand, it.unit].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>
                        <div
                          className={`shrink-0 text-2xl font-bold tabular-nums ${
                            isChecked ? "text-stone-500" : "text-ink-2"
                          }`}
                        >
                          ×{it.quantity}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {/* 완료 시 축하 + 종료 */}
      {allDone && (
        <div className="fixed bottom-0 left-0 right-0 bg-stone-900 border-t border-stone-700 p-4 pb-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success mb-2">
            <IconCheck size={32} className="text-white" />
          </div>
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
