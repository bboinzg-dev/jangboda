"use client";

import { useState } from "react";

type Result =
  | { ok: true; data: unknown; ms: number }
  | { ok: false; error: string };

// 동기 cron 수동 호출 — 동일 origin이라 cookies 자동 포함되고, checkSyncAuth/isCronAuthorized가
// origin 또는 CRON_SECRET을 검증함. (브라우저에서 헤더 직접 추가는 위험해서 origin 신뢰)
export default function SyncTriggerButton({
  path,
  label,
}: {
  path: string;
  label: string;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function trigger() {
    if (running) return;
    if (!confirm(`정말 "${label}"을 실행할까요? 외부 API quota를 소모합니다.`))
      return;

    setRunning(true);
    setResult(null);
    const start = Date.now();
    try {
      const r = await fetch(path, { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setResult({
          ok: false,
          error: `HTTP ${r.status} — ${JSON.stringify(data)}`,
        });
      } else {
        setResult({ ok: true, data, ms: Date.now() - start });
      }
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        onClick={trigger}
        disabled={running}
        className="px-3 py-2 bg-stone-900 text-white rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed min-w-[80px]"
      >
        {running ? "실행 중…" : "실행"}
      </button>
      {result && (
        <details className="text-[10px] max-w-[280px]">
          <summary
            className={`cursor-pointer font-medium ${
              result.ok ? "text-success-text" : "text-danger-text"
            }`}
          >
            {result.ok ? `✓ 성공 (${result.ms}ms)` : "✗ 실패"}
          </summary>
          <pre className="mt-1 bg-stone-100 p-2 rounded overflow-auto max-h-40 text-[10px] leading-relaxed">
            {result.ok
              ? JSON.stringify(result.data, null, 2)
              : result.error}
          </pre>
        </details>
      )}
    </div>
  );
}
