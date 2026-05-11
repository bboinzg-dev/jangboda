"use client";

import { useRouter } from "next/navigation";

// 매칭 결과 → 상세 페이지로 진입한 사용자가 자연스럽게
// 직전 페이지(매칭 결과·카탈로그·검색 등)로 돌아가게 해주는 버튼.
// referrer가 같은 origin이면 router.back(), 아니면 fallback href로 이동.
export default function BackButton({
  fallbackHref = "/benefits",
  fallbackLabel = "정부 혜택 홈으로",
}: {
  fallbackHref?: string;
  fallbackLabel?: string;
}) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    // history가 있으면 뒤로, 아니면 fallback 경로
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }

  return (
    <a
      href={fallbackHref}
      onClick={handleClick}
      className="text-sm text-ink-4 hover:text-ink-2"
    >
      ← 이전 페이지로
      <span className="sr-only"> ({fallbackLabel})</span>
    </a>
  );
}
