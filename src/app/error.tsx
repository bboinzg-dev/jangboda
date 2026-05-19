"use client";

import { useEffect } from "react";
import { logError } from "@/lib/observability";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("app/error.tsx", error, { digest: error.digest });
  }, [error]);

  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">😵</div>
      <h1 className="text-2xl font-bold mb-2">문제가 발생했습니다</h1>
      <p className="text-ink-4 mb-6 text-sm">
        잠시 후 다시 시도해주세요.
        {error.digest && (
          <span className="block text-xs mt-2 font-mono text-ink-4">
            오류 ID: {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        다시 시도
      </button>
    </div>
  );
}
