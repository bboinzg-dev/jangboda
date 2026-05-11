"use client";

import { useEffect, useState } from "react";

// 사용자가 PWA 설치 가능한 시점에 화면 하단에 살짝 띄우는 배너
// Chromium 계열만 beforeinstallprompt 이벤트 발생 (iOS Safari는 자체 가이드)

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallPrompt() {
  const [event, setEvent] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("pwa-install-dismissed") === "1") {
      setDismissed(true);
      return;
    }
    function handler(e: Event) {
      e.preventDefault();
      setEvent(e as BIPEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!event || dismissed) return null;

  async function install() {
    if (!event) return;
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") {
      setEvent(null);
    } else {
      localStorage.setItem("pwa-install-dismissed", "1");
      setDismissed(true);
    }
  }

  function dismiss() {
    localStorage.setItem("pwa-install-dismissed", "1");
    setDismissed(true);
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-30 bg-surface border border-border rounded-xl shadow-lg p-4 flex items-center gap-3">
      <div className="text-2xl shrink-0">🛒</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">홈 화면에 추가</div>
        <div className="text-xs text-ink-4">앱처럼 빠르게 영수증 올리기</div>
      </div>
      <button
        onClick={install}
        className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md shrink-0"
      >
        설치
      </button>
      <button
        onClick={dismiss}
        aria-label="닫기"
        className="text-ink-4 hover:text-ink-3 shrink-0"
      >
        ✕
      </button>
    </div>
  );
}
