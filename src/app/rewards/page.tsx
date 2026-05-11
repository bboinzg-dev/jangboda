// 포인트 보상 정책 페이지 — "내 포인트가 무엇을 풀어주는지" 한눈에
// 비로그인도 정책 카탈로그 볼 수 있고, 로그인 사용자에겐 진행 상황 표시
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { REWARD_TIERS, currentTier, nextTier } from "@/lib/rewards";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "포인트 혜택 — 장보다",
};

async function getMyPoints(): Promise<number | null> {
  const u = await getCurrentUser();
  if (!u) return null;
  const row = await prisma.user.findUnique({
    where: { id: u.id },
    select: { points: true },
  });
  return row?.points ?? 0;
}

export default async function RewardsPage() {
  const points = await getMyPoints();
  const cur = points !== null ? currentTier(points) : null;
  const next = points !== null ? nextTier(points) : null;
  const progressPct =
    points !== null && next
      ? Math.max(2, Math.round((points / next.points) * 100))
      : 100;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <header>
        <h1 className="text-2xl md:text-3xl font-extrabold text-ink-1">
          포인트 혜택
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          영수증을 등록하고 가격을 공유할수록 더 많은 기능이 풀려요.
          포인트는 <strong>현금성 환급이 아닌 기능 잠금 해제</strong> 용도입니다.
        </p>
      </header>

      {points !== null && (
        <section className="bg-surface border border-line rounded-2xl p-5">
          <div className="flex items-baseline justify-between">
            <div className="text-xs text-ink-3">내 포인트</div>
            <div className="text-3xl font-extrabold text-brand-600 tabular-nums">
              {points.toLocaleString()}
            </div>
          </div>
          <div className="mt-3 text-sm text-ink-2">
            현재 등급: <strong>{cur?.label}</strong>
          </div>
          {next ? (
            <div className="mt-3">
              <div className="w-full bg-surface-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-brand-400 to-brand-600 h-2 rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="text-xs text-ink-3 mt-2">
                다음 보상까지 <strong>{(next.points - points).toLocaleString()}점</strong>{" "}
                — <span className="text-ink-1">{next.label}</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-success-text font-medium">
              🏆 모든 등급을 달성했어요. 감사합니다!
            </div>
          )}
        </section>
      )}

      {points === null && (
        <section className="bg-brand-soft border border-line-strong rounded-2xl p-5 text-sm">
          <div className="font-semibold text-ink-1 mb-1">
            로그인 후 확인할 수 있어요
          </div>
          <Link
            href="/profile"
            className="inline-block mt-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-medium"
          >
            로그인 / 회원가입
          </Link>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold text-ink-1">전체 보상 단계</h2>
        {REWARD_TIERS.map((t) => {
          const reached = points !== null && points >= t.points;
          return (
            <div
              key={t.points}
              className={`border rounded-2xl p-4 ${
                reached
                  ? "bg-success-soft/30 border-success/30"
                  : "bg-surface border-line"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <div className="font-semibold text-ink-1">{t.label}</div>
                <div className="text-xs tabular-nums shrink-0">
                  {reached && (
                    <span className="bg-success text-white px-2 py-0.5 rounded mr-2 text-[10px] font-bold">
                      달성
                    </span>
                  )}
                  <span className="text-ink-3">
                    {t.points === 0 ? "기본" : `${t.points}점`}
                  </span>
                </div>
              </div>
              <p className="text-sm text-ink-2">{t.description}</p>
              {t.howTo && (
                <p className="text-xs text-ink-3 mt-2">→ {t.howTo}</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="bg-surface-muted border border-line rounded-2xl p-4 text-xs text-ink-3 space-y-1">
        <div className="font-semibold text-ink-2">포인트 적립 방법</div>
        <div>· 영수증 1장 등록 = +2점 (자동 매칭된 품목)</div>
        <div>· 가격 직접 등록 1건 = +5점 (상품 상세 페이지)</div>
        <div>· 신규 상품 카탈로그 등록 = +5점 (영수증 안 잡힌 신상품)</div>
      </section>

      <div className="text-center pt-2">
        <Link href="/profile" className="text-sm text-brand-600 hover:underline">
          ← 프로필로
        </Link>
      </div>
    </div>
  );
}
