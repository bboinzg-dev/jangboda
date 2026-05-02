"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error.tsx]", error);
  }, [error]);

  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">😵</div>
      <h1 className="text-2xl font-bold mb-2">문제가 발생했습니다</h1>
      <p className="text-stone-500 mb-6 text-sm">
        잠시 후 다시 시도해주세요.
        {error.digest && (
          <span className="block text-xs mt-2 font-mono text-stone-400">
            오류 ID: {error.digest}
          </span>
        )}
      </p>
      <button
        onClick={reset}
        className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg"
      >
        다시 시도
      </button>
    </div>
  );
}
