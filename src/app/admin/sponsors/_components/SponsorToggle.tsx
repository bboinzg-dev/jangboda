"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SponsorToggle({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/sponsors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !active }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    if (!confirm("이 슬롯을 영구 삭제할까요?")) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/sponsors/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`text-[11px] px-2 py-1 rounded font-bold ${
          active
            ? "bg-success-soft text-success-text"
            : "bg-surface-sunken text-ink-3"
        } disabled:opacity-50`}
      >
        {active ? "활성" : "비활성"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="text-[11px] text-ink-3 hover:text-danger-text"
      >
        삭제
      </button>
    </div>
  );
}
