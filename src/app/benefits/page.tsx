import Link from "next/link";
import { prisma } from "@/lib/db";
import { CATEGORIES } from "@/lib/benefits/types";
import { getCurrentUser } from "@/lib/supabase/server";
import { RematchButton } from "./_components/RematchButton";
import BenefitCard from "@/components/benefits/BenefitCard";

export const dynamic = "force-dynamic";

async function getBenefitsHomeData() {
  const totalBenefits = await prisma.benefit.count({ where: { active: true } });
  const byCategory = await prisma.benefit.groupBy({
    by: ["category"],
    where: { active: true, category: { not: null } },
    _count: true,
    orderBy: { _count: { category: "desc" } },
    take: 6,
  });
  // 마감 임박 (오늘 이후 30일 이내)
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const closingSoon = await prisma.benefit.count({
    where: { active: true, applyEndAt: { gte: now, lte: in30Days } },
  });
  return { totalBenefits, byCategory, closingSoon };
}

// 사용자별 상위 매칭 결과 (matched/uncertain, score desc)
async function getTopMatches(userId: string) {
  const profile = await prisma.benefitProfile.findUnique({
    where: { userId },
    select: { id: true, completeness: true },
  });
  if (!profile) return null;

  const matches = await prisma.benefitMatch.findMany({
    where: {
      profileId: profile.id,
      status: { in: ["matched", "uncertain"] },
    },
    orderBy: [{ status: "asc" }, { score: "desc" }],
    take: 8,
    include: {
      benefit: {
        select: {
          id: true,
          title: true,
          summary: true,
          agency: true,
          category: true,
          applyEndAt: true,
        },
      },
    },
  });

  return { profile, matches };
}

export default async function BenefitsHomePage() {
  // 게이팅은 src/app/benefits/layout.tsx에서 일괄 처리됨
  const data = await getBenefitsHomeData();
  const user = await getCurrentUser();
  const matchInfo = user ? await getTopMatches(user.id) : null;

  return (
    <div className="space-y-8">
      <section className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-8 border border-indigo-100">
        <div className="text-xs font-medium text-indigo-700 mb-2">정부 혜택 추천</div>
        <h1 className="text-3xl font-bold text-stone-900 mb-2">
          내가 받을 수 있는 혜택, 한 번에 찾기
        </h1>
        <p className="text-stone-600 mb-6 leading-relaxed">
          중앙정부·구청·시청에서 받을 수 있는 지원금과 복지를 통합 매칭합니다.
          <br />
          소상공인 지원, 청년·신혼·출산 혜택, 건강·교육 등 받을 수 있는 모든 것을.
        </p>
        <div className="flex flex-wrap gap-3">
          {matchInfo ? (
            <>
              <Link
                href="/benefits/onboarding"
                className="bg-white hover:bg-stone-50 border border-stone-200 px-5 py-2.5 rounded-lg font-medium"
              >
                정보 보강하기 ({matchInfo.profile.completeness}% 입력)
              </Link>
              <RematchButton />
            </>
          ) : (
            <Link
              href="/benefits/onboarding"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium"
            >
              정보 입력하고 매칭 시작
            </Link>
          )}
          <Link
            href="/benefits/catalog"
            className="bg-white hover:bg-stone-50 border border-stone-200 px-5 py-2.5 rounded-lg font-medium"
          >
            전체 혜택 둘러보기
          </Link>
        </div>
      </section>

      {/* 매칭 결과 섹션 — 프로필이 있는 사용자만 */}
      {matchInfo && (
        <section>
          <div className="flex items-end justify-between mb-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-bold">내게 맞는 혜택</h2>
              <Link
                href="/benefits/matches"
                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                전체 보기 →
              </Link>
              <Link
                href="/benefits/saved"
                className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                저장한 혜택 →
              </Link>
            </div>
            <span className="text-xs text-stone-500">
              상위 {matchInfo.matches.length}건 / 점수 높은 순
            </span>
          </div>
          {matchInfo.matches.length === 0 ? (
            <div className="text-stone-500 text-sm bg-stone-50 border border-stone-200 rounded-lg p-6 text-center">
              아직 매칭된 혜택이 없습니다. 위의 &ldquo;다시 매칭하기&rdquo; 버튼을 눌러
              평가를 실행해보세요.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {matchInfo.matches.map((m) => (
                <BenefitCard
                  key={m.id}
                  href={`/benefits/${m.benefit.id}`}
                  title={m.benefit.title}
                  summary={m.benefit.summary}
                  agency={m.benefit.agency}
                  category={m.benefit.category}
                  applyEndAt={m.benefit.applyEndAt}
                  score={m.score}
                  status={m.status as "matched" | "uncertain" | "notEligible"}
                  missingFields={m.missingFields}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="등록 혜택" value={data.totalBenefits.toLocaleString()} />
        <StatCard label="마감 30일 이내" value={data.closingSoon.toLocaleString()} accent />
        <StatCard label="입력 카테고리" value={String(CATEGORIES.length)} />
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">카테고리별 혜택</h2>
        {data.byCategory.length === 0 ? (
          <div className="text-stone-500 text-sm bg-stone-50 border border-stone-200 rounded-lg p-6 text-center">
            아직 데이터가 없습니다. 시드 스크립트로 혜택을 가져오세요.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {data.byCategory.map((c) => (
              <div
                key={c.category}
                className="card p-4"
              >
                <div className="text-xs text-stone-500">{c.category}</div>
                <div className="text-2xl font-bold text-indigo-600">{c._count}</div>
                <div className="text-xs text-stone-400">개 혜택</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div
        className={`text-2xl font-bold ${accent ? "text-rose-600" : "text-stone-900"}`}
      >
        {value}
      </div>
    </div>
  );
}

