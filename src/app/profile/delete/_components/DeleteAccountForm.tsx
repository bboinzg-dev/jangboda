"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = { nickname: string };

export default function DeleteAccountForm({ nickname }: Props) {
  const router = useRouter();
  const [confirmInput, setConfirmInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const matched = confirmInput.trim() === nickname;

  async function handleDelete() {
    if (!matched || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/me", { method: "DELETE" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error ?? "탈퇴 처리 실패");
        setBusy(false);
        return;
      }
      // Supabase Auth 세션도 즉시 종료
      try {
        const sb = createClient();
        await sb.auth.signOut();
      } catch {
        // signOut 실패해도 Prisma 데이터는 이미 삭제됨
      }
      // 완료 페이지로 이동
      router.replace("/?account_deleted=1");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "네트워크 오류");
      setBusy(false);
    }
  }

  return (
    <section className="bg-surface border border-danger/30 rounded-2xl p-4 space-y-3">
      <div className="text-sm text-ink-2">
        탈퇴를 확인하려면 아래에 본인 닉네임{" "}
        <strong className="bg-surface-muted px-1.5 py-0.5 rounded">{nickname}</strong>
        을(를) 입력하세요.
      </div>
      <input
        type="text"
        value={confirmInput}
        onChange={(e) => setConfirmInput(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        placeholder="닉네임 입력"
        className="w-full px-3 py-2.5 border border-line rounded-lg text-sm"
        aria-label="탈퇴 확인용 닉네임"
        disabled={busy}
      />
      {err && (
        <div className="text-sm text-danger-text bg-danger-soft px-3 py-2 rounded-lg">
          {err}
        </div>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={!matched || busy}
        className="w-full bg-danger hover:bg-danger/90 disabled:bg-line-strong disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-sm transition"
      >
        {busy ? "탈퇴 처리 중…" : "탈퇴하기 (되돌릴 수 없음)"}
      </button>
      <p className="text-[11px] text-ink-3">
        탈퇴 후 같은 이메일로 다시 가입하면 새 계정이 만들어지며, 이전 데이터는
        복구되지 않습니다.
      </p>
    </section>
  );
}
