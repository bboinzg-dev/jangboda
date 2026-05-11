import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { canAccessBenefits, REQUIRED_POINTS } from "@/lib/benefits/access";

export const dynamic = "force-dynamic";

export default async function BenefitsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supaUser = await getCurrentUser();
  const dbUser = supaUser
    ? await prisma.user.findUnique({
        where: { id: supaUser.id },
        select: { points: true },
      })
    : null;

  const access = canAccessBenefits(dbUser);
  if (access.allowed) return <>{children}</>;

  return <BenefitsGate loggedIn={Boolean(supaUser)} access={access} />;
}

function BenefitsGate({
  loggedIn,
  access,
}: {
  loggedIn: boolean;
  access: ReturnType<typeof canAccessBenefits>;
}) {
  const progress = Math.min(
    100,
    Math.round((access.currentPoints / REQUIRED_POINTS) * 100),
  );

  return (
    <div className="space-y-6">
      <section className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-8 border border-indigo-100 text-center">
        <div className="text-3xl mb-3">🎁</div>
        <h1 className="text-2xl font-bold text-ink-1 mb-2">
          정부 혜택 추천은 곧 열립니다
        </h1>
        <p className="text-ink-3 leading-relaxed">
          {loggedIn
            ? "영수증을 올려 가격 데이터를 함께 만들어주신 분께 우선 제공돼요."
            : "먼저 로그인하고 영수증을 올려 가격 데이터를 함께 만들어주세요."}
        </p>
      </section>

      {loggedIn ? (
        <section className="card p-6">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-sm font-medium text-ink-2">
              내 기여 포인트
            </span>
            <span className="text-lg font-bold text-indigo-700 tabular-nums">
              {access.currentPoints} / {REQUIRED_POINTS}점
            </span>
          </div>
          <div className="w-full bg-surface-muted rounded-full h-2.5 overflow-hidden mb-3">
            <div
              className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-2.5 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-ink-4 mb-5">
            영수증 1장당 매칭된 상품 +2점, 신규 등록된 상품 +5점이 적립돼요.
            <br />
            영수증 {Math.ceil(access.pointsNeeded / 5)}~{access.pointsNeeded}장만 더 올리면 열립니다.
          </p>
          <Link
            href="/upload"
            className="block w-full text-center bg-brand-600 hover:bg-brand-700 text-white px-5 py-3 rounded-lg font-semibold shadow-soft transition"
          >
            영수증 올리고 포인트 쌓기 →
          </Link>
        </section>
      ) : (
        <section className="card p-6 text-center space-y-4">
          <p className="text-sm text-ink-3">
            로그인 후 영수증 업로드로 포인트를 쌓으면 자동으로 열려요.
          </p>
          <Link
            href="/?auth=login"
            className="inline-block bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-lg font-semibold shadow-soft transition"
          >
            로그인하기
          </Link>
        </section>
      )}

      <section className="bg-surface-muted border border-line rounded-lg p-4 text-xs text-ink-4 leading-relaxed">
        <strong className="text-ink-2 block mb-1">왜 게이팅이 있나요?</strong>
        장보다는 사용자 영수증으로 만들어지는 가격비교 서비스입니다. 정부 혜택 추천도
        함께 데이터를 만들어주신 분께 우선 제공해서 모두에게 더 정확한 매칭을
        돌려드리려는 취지입니다.
      </section>
    </div>
  );
}
