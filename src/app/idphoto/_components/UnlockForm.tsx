"use client";

import { useState } from "react";

export default function UnlockForm({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/idphoto/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(data.error ?? "인증에 실패했습니다.");
        return;
      }
      onUnlock();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white border border-stone-200 rounded-2xl p-6 max-w-md mx-auto">
      <div className="text-center mb-5">
        <div className="text-4xl mb-2">🔒</div>
        <h2 className="font-bold text-lg mb-1">비밀번호 확인</h2>
        <p className="text-sm text-stone-500 leading-relaxed">
          이 기능은 외부 AI API를 호출하므로
          <br />
          관리자에게 받은 비밀번호가 필요합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="w-full px-4 py-3 border border-stone-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent"
          disabled={submitting}
          autoFocus
        />

        {error && (
          <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full bg-brand-500 hover:bg-brand-600 disabled:bg-stone-300 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {submitting ? "확인 중..." : "확인"}
        </button>
      </form>

      <p className="text-[11px] text-stone-400 text-center mt-4 leading-relaxed">
        인증은 12시간 동안 유지됩니다.
      </p>
    </section>
  );
}
