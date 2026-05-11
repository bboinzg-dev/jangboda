"use client";

import { useEffect, useState } from "react";
import { formatWon } from "@/lib/format";

type Props = {
  thisMonth: number; // 가계부 페이지가 계산한 이번 달 지출
};

// 월 예산 설정 + 진행률 카드
// - 미설정 시: "월 예산 설정" 인풋 + 저장 버튼
// - 설정 후: 진행률 바 + 잔여/초과 텍스트
export default function BudgetGoalCard({ thisMonth }: Props) {
  const [monthlyAmount, setMonthlyAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/budget/goal")
      .then((r) => r.json())
      .then((d) => {
        if (d.authed && d.monthlyAmount != null) {
          setMonthlyAmount(d.monthlyAmount);
          setDraft(String(d.monthlyAmount));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function save() {
    const amount = parseInt(draft.replace(/[^\d]/g, ""), 10);
    if (isNaN(amount) || amount < 0) return alert("올바른 금액을 입력하세요");
    setSaving(true);
    const res = await fetch("/api/budget/goal", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyAmount: amount }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      setMonthlyAmount(data.monthlyAmount);
      setEditing(false);
    } else {
      alert(data.error ?? "저장 실패");
    }
  }

  if (loading) {
    return (
      <div className="card p-5 animate-pulse h-24" />
    );
  }

  // 미설정 + 편집 모드 X
  if (monthlyAmount == null && !editing) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-ink-1">🎯 월 예산</div>
            <div className="text-xs text-ink-3 mt-0.5">
              한 달 지출 목표를 설정하면 진행률이 보여요
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5 rounded-md font-medium shrink-0"
          >
            예산 설정
          </button>
        </div>
      </div>
    );
  }

  // 편집 모드
  if (editing) {
    return (
      <div className="card p-5 space-y-3">
        <div className="font-bold text-ink-1">🎯 월 예산 설정</div>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) =>
              setDraft(e.target.value.replace(/[^\d,]/g, ""))
            }
            placeholder="예: 300000"
            className="flex-1 px-3 py-2 border border-line-strong rounded-md tabular-nums"
          />
          <button
            onClick={save}
            disabled={saving}
            className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
          >
            {saving ? "저장 중..." : "저장"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setDraft(monthlyAmount ? String(monthlyAmount) : "");
            }}
            className="border border-line-strong text-ink-3 px-3 py-2 rounded-md text-sm"
          >
            취소
          </button>
        </div>
        <div className="text-xs text-ink-3">
          0원으로 설정하면 예산 표시가 사라져요
        </div>
      </div>
    );
  }

  // 설정됨 — 진행률 표시
  const goal = monthlyAmount ?? 0;
  if (goal === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold text-ink-1">🎯 월 예산</div>
            <div className="text-xs text-ink-3 mt-0.5">
              예산이 0원으로 설정됨
            </div>
          </div>
          <button
            onClick={() => {
              setDraft("");
              setEditing(true);
            }}
            className="text-sm text-brand-600 hover:underline shrink-0"
          >
            수정
          </button>
        </div>
      </div>
    );
  }

  const pct = Math.min(Math.round((thisMonth / goal) * 100), 999);
  const remaining = goal - thisMonth;
  const isOver = remaining < 0;
  const barColor = pct <= 70 ? "bg-success" : pct <= 100 ? "bg-warning" : "bg-danger";
  const textColor = isOver ? "text-danger-text" : pct <= 70 ? "text-success-text" : "text-warning-text";

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="font-bold text-ink-1">🎯 월 예산</div>
          <div className="text-xs text-ink-3 mt-0.5 tabular-nums">
            {formatWon(thisMonth)} / {formatWon(goal)}
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-brand-600 hover:underline shrink-0"
        >
          수정
        </button>
      </div>

      {/* 진행률 바 */}
      <div className="h-3 bg-surface-muted rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      <div className={`text-sm font-medium ${textColor}`}>
        {isOver
          ? `⚠️ 예산 초과 ${formatWon(Math.abs(remaining))} (${pct}%)`
          : `남은 예산 ${formatWon(remaining)} (${pct}% 사용)`}
      </div>
    </div>
  );
}
