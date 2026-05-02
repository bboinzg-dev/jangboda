"use client";

// 다시 매칭하기 버튼 — POST /api/benefits/match 호출 후 페이지 리프레시
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RematchButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/benefits/match", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "매칭 실패");
        return;
      }
      setMsg(
        `평가 ${data.totalEvaluated}건 / 매칭 ${data.matched} · 검토 ${data.uncertain}`,
      );
      router.refresh();
    } catch (e) {
      setMsg("네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={loading}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-stone-300 text-white px-5 py-2.5 rounded-lg font-medium"
      >
        {loading ? "매칭 중..." : "다시 매칭하기"}
      </button>
      {msg && <span className="text-xs text-stone-600">{msg}</span>}
    </div>
  );
}
