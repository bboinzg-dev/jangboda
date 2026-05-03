"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 첫 사용자 가이드 — 3단계 온보딩
// - 비로그인: "로그인하고 시작하기" 안내
// - 로그인: 각 단계 완료 여부 표시 (favorites/receipts/prices)
// - localStorage("jb.onboarding.dismissed")로 닫기 상태 저장
// - 모든 단계 완료 시 자동 숨김
//
// props:
//   - authed: 로그인 여부 (서버에서 전달)
//   - status: { favorites, receipts, prices } 각 카운트 (서버에서 전달)
export type OnboardingStatus = {
  favorites: number;
  receipts: number;
  prices: number;
};

const DISMISS_KEY = "jb.onboarding.dismissed";

// 옵셔널 props — 호출자가 SSR에서 데이터를 미리 넘길 수 있지만,
// 안 넘기면 client에서 /api/onboarding fetch (페이지 ISR 유지를 위해 권장)
export default function OnboardingCard({
  authed: authedProp,
  status: statusProp,
}: {
  authed?: boolean;
  status?: OnboardingStatus;
} = {}) {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [fetchedAuthed, setFetchedAuthed] = useState<boolean | undefined>(
    authedProp
  );
  const [fetchedStatus, setFetchedStatus] = useState<OnboardingStatus | undefined>(
    statusProp
  );

  // SSR props가 없으면 client에서 fetch
  useEffect(() => {
    if (authedProp !== undefined) return;
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d: { authed: boolean; status?: OnboardingStatus }) => {
        setFetchedAuthed(d.authed);
        setFetchedStatus(d.status);
      })
      .catch(() => setFetchedAuthed(false));
  }, [authedProp]);

  const authed = fetchedAuthed ?? false;
  const status = fetchedStatus;

  // localStorage 초기 상태 로드 (SSR 회피)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  // 초기 로드 전에는 빈 자리 (점멸 회피)
  if (dismissed === null) return null;
  if (dismissed) return null;

  // 비로그인 상태 — 가벼운 안내 카드
  if (!authed) {
    return (
      <section className="bg-white border border-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-base mb-1">🛒 장보다 시작하기</h2>
            <p className="text-sm text-stone-600 leading-relaxed">
              로그인하면 자주 가는 마트, 영수증, 가격 알림이 모두 저장됩니다.
            </p>
          </div>
          <button
            onClick={dismiss}
            aria-label="온보딩 닫기"
            className="text-stone-400 hover:text-stone-700 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
        <div className="mt-3">
          <Link
            href="/?auth_error=login_required"
            className="inline-block text-sm text-brand-600 hover:underline font-medium"
          >
            구글 로그인하고 시작 →
          </Link>
        </div>
      </section>
    );
  }

  const s: OnboardingStatus = status ?? { favorites: 0, receipts: 0, prices: 0 };
  const step1Done = s.favorites > 0;
  const step2Done = s.receipts > 0;
  const step3Done = s.prices > 0;
  const allDone = step1Done && step2Done && step3Done;

  // 모든 단계 완료 시 카드 숨김 (한번 더 안 보여줌)
  if (allDone) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* 무시 */
    }
    setDismissed(true);
  }

  return (
    <section className="bg-white border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="font-bold text-base">🛒 장보다 시작하기</h2>
          <p className="text-xs text-stone-500 mt-0.5">
            3단계만 완료하면 절약이 시작됩니다
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="온보딩 닫기"
          className="text-stone-400 hover:text-stone-700 text-lg leading-none px-1 shrink-0"
          title="닫기"
        >
          ×
        </button>
      </div>

      <ol className="space-y-2">
        <Step
          n={1}
          done={step1Done}
          href="/stores"
          icon="★"
          title="자주 가는 마트 등록"
          desc='"주변 마트"에서 ★를 눌러 즐겨찾기 추가'
        />
        <Step
          n={2}
          done={step2Done}
          href="/upload"
          icon="📸"
          title="영수증 한 장 올리기"
          desc="자동 인식으로 가격이 등록됩니다"
        />
        <Step
          n={3}
          done={step3Done}
          href="/cart"
          icon="🛒"
          title="장바구니에 살 물건 추가"
          desc="어느 마트가 가장 싼지 즉시 비교"
        />
      </ol>
    </section>
  );
}

function Step({
  n,
  done,
  href,
  icon,
  title,
  desc,
}: {
  n: number;
  done: boolean;
  href: string;
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
          done
            ? "bg-success-soft border-success-soft hover:opacity-90"
            : "bg-stone-50 border-border hover:bg-stone-100"
        }`}
      >
        {/* 단계 표시 — 완료/미완료 */}
        <div
          className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
            done
              ? "bg-success text-white"
              : "bg-stone-200 text-stone-600"
          }`}
          aria-label={done ? "완료" : `단계 ${n}`}
        >
          {done ? "✓" : n}
        </div>
        <div className="text-xl shrink-0" aria-hidden>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`font-medium text-sm ${
              done ? "text-success-text" : "text-stone-900"
            }`}
          >
            {title}
          </div>
          <div
            className={`text-xs truncate ${
              done ? "text-success-text" : "text-stone-500"
            }`}
          >
            {desc}
          </div>
        </div>
        <div
          className={`text-xs shrink-0 ${
            done ? "text-success-text" : "text-stone-400"
          }`}
        >
          {done ? "완료" : "→"}
        </div>
      </Link>
    </li>
  );
}
