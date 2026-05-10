"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  priceId: string;
  productName: string;
};

// 가계부 행에서 잘못 등록된 가격을 사용자가 즉시 삭제 (OCR 오인식 정정 핵심 UX)
// confirm 한 번 → DELETE → router.refresh()로 가계부 즉시 반영
export default function RemovePriceButton({ priceId, productName }: Props) {
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function remove() {
    if (busy) return;
    if (
      !confirm(
        `"${productName}" 항목을 가계부에서 삭제할까요?\n\n` +
          "잘못 인식된 항목이면 삭제하세요. 매장 가격 비교 데이터에서도 제거됩니다.",
      )
    )
      return;

    setBusy(true);
    try {
      const r = await fetch(`/api/prices/${priceId}`, { method: "DELETE" });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        alert(data.error ?? "삭제하지 못했어요");
        return;
      }
      // SSR 데이터 다시 가져와 가계부 즉시 갱신
      startTransition(() => {
        router.refresh();
      });
    } catch {
      alert("네트워크 오류로 삭제하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label={`${productName} 항목 삭제`}
      title="잘못 등록된 항목 삭제"
      className="text-ink-3 hover:text-danger-text px-1.5 py-1 rounded text-xs disabled:opacity-40"
    >
      {busy ? "…" : "✕"}
    </button>
  );
}
