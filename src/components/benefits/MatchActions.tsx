"use client";

import { useState } from "react";

type Action = "saved" | "dismissed" | "applied" | null;

type Props = {
  benefitId: string;
  initialAction: string | null;
};

// 정부 혜택 상세 페이지의 "저장" / "관심 없음" 토글 버튼.
// 낙관적 업데이트(즉시 UI 반영) + 실패 시 rollback.
export default function MatchActions({ benefitId, initialAction }: Props) {
  const [action, setAction] = useState<Action>(
    (initialAction === "saved" ||
      initialAction === "dismissed" ||
      initialAction === "applied")
      ? initialAction
      : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function postAction(next: Action) {
    if (pending) return;
    const prev = action;
    // 낙관적 업데이트 — 즉시 반영
    setAction(next);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/benefits/match/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benefitId, action: next }),
      });
      if (res.status === 401) {
        // 인증 없음 — rollback + 안내
        setAction(prev);
        setError("로그인이 필요합니다");
        return;
      }
      if (!res.ok) {
        setAction(prev);
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "요청 실패");
        return;
      }
      const j = await res.json();
      // 서버 응답 값으로 동기화 (혹시 다른 값으로 바뀌었으면)
      const serverAction: Action =
        j.userAction === "saved" ||
        j.userAction === "dismissed" ||
        j.userAction === "applied"
          ? j.userAction
          : null;
      setAction(serverAction);
    } catch {
      setAction(prev);
      setError("네트워크 오류");
    } finally {
      setPending(false);
    }
  }

  // 저장 버튼: saved이면 다시 누르면 해제(null), 아니면 "saved"로 set
  function onClickSave() {
    postAction(action === "saved" ? null : "saved");
  }

  // 관심 없음 버튼: dismissed이면 해제, 아니면 dismissed로 set
  function onClickDismiss() {
    postAction(action === "dismissed" ? null : "dismissed");
  }

  const savedActive = action === "saved";
  const dismissedActive = action === "dismissed";

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onClickSave}
          disabled={pending}
          className={`text-sm px-3 py-1.5 rounded-md border transition disabled:opacity-60 disabled:cursor-not-allowed ${
            savedActive
              ? "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700"
              : "bg-white border-indigo-300 text-indigo-700 hover:bg-indigo-50"
          }`}
        >
          {savedActive ? "★ 저장됨" : "☆ 이 혜택 저장하기"}
        </button>
        <button
          type="button"
          onClick={onClickDismiss}
          disabled={pending}
          className={`text-sm px-3 py-1.5 rounded-md border transition disabled:opacity-60 disabled:cursor-not-allowed ${
            dismissedActive
              ? "bg-stone-200 border-stone-300 text-stone-700 hover:bg-stone-300"
              : "bg-white border-stone-300 text-stone-600 hover:bg-stone-50"
          }`}
        >
          {dismissedActive ? "관심 없음 해제" : "관심 없음"}
        </button>
      </div>
      {error && (
        <div className="mt-2 text-xs text-rose-600">{error}</div>
      )}
    </div>
  );
}
