import Link from "next/link";
import { prisma } from "@/lib/db";
import { CATEGORIES } from "@/lib/benefits/types";
import { getCurrentUser } from "@/lib/supabase/server";
import { RematchButton } from "./_components/RematchButton";

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
  // TODO(포인트 게이팅): 활성화 시 src/lib/benefits/access.ts의 canAccessBenefits() 호출
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
            <h2 className="text-xl font-bold">내게 맞는 혜택</h2>
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
              {matchInfo.matches.map((m) => {
                const dDays = m.benefit.applyEndAt
                  ? Math.ceil(
                      (m.benefit.applyEndAt.getTime() - Date.now()) /
                        (24 * 60 * 60 * 1000),
                    )
                  : null;
                return (
                  <Link
                    key={m.id}
                    href={`/benefits/${m.benefit.id}`}
                    className="block bg-white border border-stone-200 hover:border-indigo-300 hover:shadow-sm rounded-lg p-4 transition"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                          {m.benefit.category && (
                            <span className="bg-stone-100 px-2 py-0.5 rounded">
                              {m.benefit.category}
                            </span>
                          )}
                          {m.benefit.agency && (
                            <span className="truncate">{m.benefit.agency}</span>
                          )}
                        </div>
                        <h3 className="font-semibold text-stone-900 leading-snug line-clamp-2">
                          {m.benefit.title}
                        </h3>
                      </div>
                      <ScoreBadge score={m.score} status={m.status} />
                    </div>
                    {m.benefit.summary && (
                      <p className="text-sm text-stone-600 line-clamp-2 mb-2">
                        {m.benefit.summary}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-stone-500">
                      {dDays !== null && (
                        <span
                          className={
                            dDays <= 7
                              ? "text-rose-600 font-medium"
                              : dDays <= 30
                              ? "text-amber-600"
                              : ""
                          }
                        >
                          {dDays >= 0 ? `D-${dDays}` : "마감"}
                        </span>
                      )}
                      {m.missingFields.length > 0 && (
                        <span>입력 보강 시 {m.missingFields.length}개 추가 평가</span>
                      )}
                    </div>
                  </Link>
                );
              })}
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
                className="bg-white border border-stone-200 rounded-lg p-4"
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
    <div className="bg-white border border-stone-200 rounded-lg p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div
        className={`text-2xl font-bold ${accent ? "text-rose-600" : "text-stone-900"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ScoreBadge({ score, status }: { score: number; status: string }) {
  const color =
    status === "matched"
      ? score >= 70
        ? "bg-indigo-100 text-indigo-700"
        : "bg-blue-100 text-blue-700"
      : "bg-stone-100 text-stone-600";
  const label = status === "matched" ? "매칭" : "검토";
  return (
    <div className={`shrink-0 text-center rounded px-2 py-1 ${color}`}>
      <div className="text-base font-bold leading-none">{score}</div>
      <div className="text-[10px] mt-0.5">{label}</div>
    </div>
  );
}
