"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";

type Summary = {
  ok: boolean;
  authed: boolean;
  hasData?: boolean;
  thisMonth?: number;
  savedAmount?: number;
  topCategory?: { category: string; pct: number; total: number } | null;
  totalCount?: number;
};

// 홈 페이지의 가계부 위젯 — 로그인 사용자에게 이번 달 KPI 미니 카드 노출
// page.tsx의 ISR(60초)을 깨지 않기 위해 client-side fetch.
export default function BudgetSummaryWidget() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let aborted = false;
    fetch("/api/budget/summary")
      .then((r) => r.json())
      .then((data: Summary) => {
        if (!aborted) {
          setSummary(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, []);

  // 비로그인이면 위젯 자체 안 그림
  if (loading) return null;
  if (!summary?.authed) return null;

  // 데이터 없으면 영수증 올리기 유도 카드
  if (!summary.hasData) {
    return (
      <Link
        href="/upload"
        className="block bg-gradient-to-br from-emerald-50 to-emerald-100 border border-success/30 rounded-xl p-5 hover:shadow-sm transition-shadow"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            📊
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-success">
              가계부 시작하기
            </div>
            <div className="text-xs text-success-text mt-0.5">
              영수증 1장이면 자동으로 분석해 드려요
            </div>
          </div>
          <span className="text-success">→</span>
        </div>
      </Link>
    );
  }

  // 데이터 있으면 미니 KPI 카드
  return (
    <Link
      href="/budget"
      className="block bg-gradient-to-br from-brand-50 to-brand-100 border border-brand-200 rounded-xl p-5 hover:shadow-sm transition-shadow"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs text-brand-700 font-medium">
            📊 내 가계부
          </div>
          <div className="text-[10px] text-brand-600/70 mt-0.5">
            영수증 {summary.totalCount}건 누적
          </div>
        </div>
        <span className="text-brand-600 text-sm">자세히 →</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-brand-700 font-medium">
            이번 달 지출
          </div>
          <div className="text-lg font-extrabold text-brand-700 tabular-nums">
            {formatWon(summary.thisMonth ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-success-text font-medium">
            🎉 누적 절약
          </div>
          <div className="text-lg font-extrabold text-success-text tabular-nums">
            {formatWon(summary.savedAmount ?? 0)}
          </div>
        </div>
      </div>

      {summary.topCategory && (
        <div className="mt-2 text-[11px] text-brand-700/80">
          이번 달 1위 카테고리:{" "}
          <span className="font-medium">{summary.topCategory.category}</span>
          {" "}({summary.topCategory.pct}%)
        </div>
      )}
    </Link>
  );
}
