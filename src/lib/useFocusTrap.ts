"use client";

import { useEffect, useRef } from "react";

// 모달 포커스 관리 훅 — WCAG 2.4.3(Focus Order) 대응.
// active=true가 되면 (1) 컨테이너 내 첫 포커서블 요소로 포커스 이동,
// (2) Tab/Shift+Tab을 컨테이너 내부로 가두고(trap), (3) active=false(닫힘) 시
// 직전 포커스 요소(트리거 버튼)로 복원한다.
//
// 사용:
//   const ref = useFocusTrap<HTMLDivElement>(open);
//   <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>...</div>
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null); // 화면에 보이는 요소만

    // 초기 포커스 — 첫 포커서블(없으면 컨테이너 자체)
    (focusables()[0] ?? container).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("keydown", onKeyDown);
      // 닫힐 때 트리거로 포커스 복원
      previouslyFocused?.focus?.();
    };
  }, [active]);

  return containerRef;
}
