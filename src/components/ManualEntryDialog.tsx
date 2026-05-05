"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  "신선식품",
  "유제품",
  "가공·즉석식품",
  "음료",
  "주류",
  "양념·조미료",
  "곡물·면·빵",
  "과자·간식",
  "생활용품",
  "기타",
] as const;

// 가계부에 영수증 없이 거래 직접 추가 (현금/외식/시장 등)
// 모달 다이얼로그 — 매장명/상품명/카테고리/금액/날짜 입력
export default function ManualEntryDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState<string>("기타");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStoreName("");
    setProductName("");
    setCategory("기타");
    setAmount("");
    setDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNum = parseInt(amount.replace(/[^\d]/g, ""), 10);
    if (!storeName.trim() || !productName.trim() || !amountNum || amountNum <= 0) {
      setError("매장명·상품명·금액 모두 입력해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/budget/manual-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeName: storeName.trim(),
          productName: productName.trim(),
          category,
          amount: amountNum,
          date,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        close();
        router.refresh();
      } else {
        setError(data.error ?? "저장 실패");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-sm border border-line text-ink-2 hover:bg-surface-muted px-3 py-1.5 rounded-lg font-medium inline-flex items-center gap-1"
        title="영수증 없이 거래 직접 추가 (현금/외식 등)"
      >
        ✍️ 직접 입력
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={close}
        >
          <div
            className="bg-white rounded-xl p-5 w-full max-w-md max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">✍️ 거래 직접 입력</h2>
              <button
                onClick={close}
                className="text-stone-500 hover:text-stone-800 text-xl leading-none"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-stone-500 mb-4">
              영수증 없는 거래(현금·외식·시장 등)를 가계부에 추가합니다.
            </p>

            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  매장 / 장소
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="예: 동네 김치찌개집, 시장, 편의점"
                  className="w-full px-3 py-2 border border-stone-300 rounded"
                  required
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">상품 / 항목</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="예: 김치찌개 점심, 양배추 1통, 음료"
                  className="w-full px-3 py-2 border border-stone-300 rounded"
                  required
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1">카테고리</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">날짜</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">금액 (원)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^\d,]/g, ""))
                  }
                  placeholder="예: 8000"
                  className="w-full px-3 py-2 border border-stone-300 rounded tabular-nums"
                  required
                />
              </div>

              {error && (
                <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 border border-stone-300 text-stone-600 py-2 rounded-md text-sm"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-md font-medium disabled:opacity-50"
                >
                  {submitting ? "저장 중..." : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
