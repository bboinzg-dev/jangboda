"use client";

import { useState } from "react";

type Props = {
  priceId: string;
  currentPrice: number;
};

const REASONS = [
  { value: "가격이 다름", label: "가격이 다름" },
  { value: "더 싼 곳 있음", label: "더 싼 곳 있음" },
  { value: "이미 품절", label: "이미 품절" },
  { value: "기타", label: "기타" },
];

export default function ReportPriceButton({ priceId, currentPrice }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0].value);
  const [suggested, setSuggested] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body: { reason: string; suggestedPrice?: number } = { reason };
      const sp = parseInt(suggested, 10);
      if (!Number.isNaN(sp) && sp > 0) body.suggestedPrice = sp;

      const r = await fetch(`/api/prices/${priceId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setErr(data.error ?? "신고 실패");
      } else {
        setDone(true);
        setOpen(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  if (done) {
    return (
      <span
        className="text-[10px] text-stone-400 px-1.5 py-0.5"
        title="신고 접수됨"
      >
        🚩 신고됨
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] text-stone-400 hover:text-rose-500 px-1.5 py-0.5"
        title="가격 신고"
        aria-label="가격 신고"
      >
        🚩 신고
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="bg-white rounded-xl p-5 w-full max-w-sm shadow-lg space-y-3"
          >
            <div className="font-bold text-base">이 가격이 잘못됐나요?</div>
            <div className="text-xs text-stone-500">
              현재 등록 가격: {currentPrice.toLocaleString("ko-KR")}원
            </div>

            <div className="space-y-1.5">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <span>{r.label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-stone-500">
                제안 가격 (선택, 원 단위)
              </label>
              <input
                type="number"
                value={suggested}
                onChange={(e) => setSuggested(e.target.value)}
                placeholder="예: 2900"
                className="w-full px-2 py-1.5 border border-stone-300 rounded text-sm"
                min={0}
              />
            </div>

            {err && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">
                {err}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-3 py-1.5 text-sm text-stone-500 hover:text-stone-700"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={busy}
                className="bg-rose-500 hover:bg-rose-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50"
              >
                {busy ? "전송 중..." : "신고 접수"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
