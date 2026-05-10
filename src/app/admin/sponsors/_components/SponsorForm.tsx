"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  placements: { key: string; label: string }[];
};

export default function SponsorForm({ placements }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr(null);

    const fd = new FormData(e.currentTarget);
    const payload = {
      placement: String(fd.get("placement") ?? ""),
      title: String(fd.get("title") ?? "").trim(),
      body: String(fd.get("body") ?? "").trim() || null,
      imageUrl: String(fd.get("imageUrl") ?? "").trim() || null,
      ctaLabel: String(fd.get("ctaLabel") ?? "").trim() || "자세히 보기",
      href: String(fd.get("href") ?? "").trim(),
      notes: String(fd.get("notes") ?? "").trim() || null,
      weight: Number(fd.get("weight") ?? 0) || 0,
    };

    if (!payload.title || !payload.href || !payload.placement) {
      setErr("placement / 제목 / 링크는 필수입니다");
      setBusy(false);
      return;
    }

    try {
      const r = await fetch("/api/admin/sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setErr(data.error ?? "등록 실패");
        return;
      }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    } catch {
      setErr("네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
      <label className="space-y-1">
        <span className="text-xs text-ink-3">노출 위치 *</span>
        <select
          name="placement"
          required
          className="w-full border border-line rounded px-2 py-1.5"
        >
          {placements.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label} ({p.key})
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-3">우선순위 (높을수록 먼저)</span>
        <input
          type="number"
          name="weight"
          defaultValue={0}
          className="w-full border border-line rounded px-2 py-1.5"
        />
      </label>
      <label className="space-y-1 md:col-span-2">
        <span className="text-xs text-ink-3">제목 *</span>
        <input
          name="title"
          required
          maxLength={120}
          placeholder="예: 전국 마트 캐시백 카드"
          className="w-full border border-line rounded px-2 py-1.5"
        />
      </label>
      <label className="space-y-1 md:col-span-2">
        <span className="text-xs text-ink-3">설명 (1~2줄)</span>
        <input
          name="body"
          maxLength={200}
          className="w-full border border-line rounded px-2 py-1.5"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-3">이미지 URL</span>
        <input
          name="imageUrl"
          type="url"
          className="w-full border border-line rounded px-2 py-1.5"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-ink-3">CTA 라벨</span>
        <input
          name="ctaLabel"
          defaultValue="자세히 보기"
          maxLength={20}
          className="w-full border border-line rounded px-2 py-1.5"
        />
      </label>
      <label className="space-y-1 md:col-span-2">
        <span className="text-xs text-ink-3">외부 링크 *</span>
        <input
          name="href"
          required
          type="url"
          className="w-full border border-line rounded px-2 py-1.5"
        />
      </label>
      <label className="space-y-1 md:col-span-2">
        <span className="text-xs text-ink-3">운영 메모 (사용자 노출 X)</span>
        <input
          name="notes"
          maxLength={200}
          placeholder="광고주명, 단가, 계약 만료일 등"
          className="w-full border border-line rounded px-2 py-1.5"
        />
      </label>

      {err && <div className="md:col-span-2 text-xs text-danger-text">{err}</div>}

      <div className="md:col-span-2 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="bg-stone-900 hover:bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-60"
        >
          {busy ? "등록 중…" : "등록"}
        </button>
      </div>
    </form>
  );
}
