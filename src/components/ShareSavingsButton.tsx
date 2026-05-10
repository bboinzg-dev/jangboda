"use client";

import { useState } from "react";

type Props = {
  savedAmount: number; // 누적 절약액 (원)
  thisMonth: number; // 이번 달 지출
  monthLabel: number; // 1~12
};

// "이번 달 N원 아꼈어요" 카드 공유
// Web Share API 사용 가능하면 네이티브 시트, 아니면 클립보드 복사 fallback.
// 한국 카카오톡/문자 공유는 Web Share API에서 정상 처리됨.
export default function ShareSavingsButton({
  savedAmount,
  thisMonth,
  monthLabel,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const text =
    savedAmount > 0
      ? `장보다로 ${monthLabel}월에 ${fmt(savedAmount)}원 아꼈어요! 🎉\n` +
        `이번 달 지출은 ${fmt(thisMonth)}원이에요.\n` +
        `https://jangboda.vercel.app`
      : `장보다로 ${monthLabel}월 지출 ${fmt(thisMonth)}원!\n` +
        `영수증 한 장이면 가계부가 자동으로 정리돼요.\n` +
        `https://jangboda.vercel.app`;

  async function share() {
    if (busy) return;
    setBusy(true);
    setCopied(false);

    try {
      const nav = typeof navigator !== "undefined" ? navigator : null;
      if (nav && typeof nav.share === "function") {
        await nav.share({
          title: "장보다 — 이번 달 절약 기록",
          text,
        });
      } else if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
        await nav.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      } else {
        // 두 기능 모두 없으면 prompt로 fallback (구형 브라우저)
        window.prompt("아래 텍스트를 복사해서 공유하세요", text);
      }
    } catch {
      // 사용자가 share dialog를 닫은 경우 등 — silent
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold shadow-soft disabled:opacity-60"
      aria-label="이번 달 절약 기록 공유"
    >
      <span aria-hidden>📤</span>
      <span>{copied ? "복사 완료!" : "공유"}</span>
    </button>
  );
}
