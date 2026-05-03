import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/supabase/server";
import { stripHtml } from "@/lib/benefits/sanitize";
import { categoryGroup } from "@/lib/benefits/categories";
import { sourceLabel } from "@/lib/benefits/types";
import BackButton from "@/components/benefits/BackButton";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type StatusFilter = "matched" | "uncertain" | "all";

type SearchParams = {
  page?: string;
  status?: string;
};

function parseSearchParams(sp: SearchParams) {
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const rawStatus = (sp.status ?? "matched").trim();
  const status: StatusFilter =
    rawStatus === "matched" || rawStatus === "uncertain" || rawStatus === "all"
      ? (rawStatus as StatusFilter)
      : "matched";
  return { page, status };
}

// 상태 필터 → Prisma where 조각
// "all"은 (matched, uncertain) 둘 다 — notEligible은 제외
function statusWhere(status: StatusFilter): Prisma.BenefitMatchWhereInput {
  if (status === "matched") return { status: "matched" };
  if (status === "uncertain") return { status: "uncertain" };
  return { status: { in: ["matched", "uncertain"] } };
}

async function getMatches(profileId: string, f: ReturnType<typeof parseSearchParams>) {
  const where: Prisma.BenefitMatchWhereInput = {
    profileId,
    ...statusWhere(f.status),
  };
  const skip = (f.page - 1) * PAGE_SIZE;
  const [total, items] = await Promise.all([
    prisma.benefitMatch.count({ where }),
    prisma.benefitMatch.findMany({
      where,
      orderBy: [{ score: "desc" }],
      skip,
      take: PAGE_SIZE,
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
    }),
  ]);
  return { total, items };
}

function buildQuery(
  f: ReturnType<typeof parseSearchParams>,
  override: Partial<{ page: number; status: StatusFilter }>,
): string {
  const params = new URLSearchParams();
  const status = override.status ?? f.status;
  if (status !== "matched") params.set("status", status);
  const page = override.page ?? f.page;
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: "matched", label: "매칭" },
  { key: "uncertain", label: "검토 필요" },
  { key: "all", label: "전체" },
];

export default async function BenefitsMatchesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const f = parseSearchParams(searchParams);
  const user = await getCurrentUser();

  // 로그인 안 된 상태
  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <BackButton fallbackHref="/benefits" fallbackLabel="정부 혜택 홈으로" />
        </div>
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-10 text-center">
          <div className="text-stone-700 font-medium mb-1">로그인이 필요합니다</div>
          <div className="text-sm text-stone-500 mb-4">
            매칭 결과를 확인하려면 먼저 로그인 후 정보를 입력해 주세요.
          </div>
          <Link
            href="/benefits/onboarding"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            정보 입력하러 가기
          </Link>
        </div>
      </div>
    );
  }

  // 프로필 없음
  const profile = await prisma.benefitProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, completeness: true },
  });

  if (!profile) {
    return (
      <div className="space-y-6">
        <div>
          <BackButton fallbackHref="/benefits" fallbackLabel="정부 혜택 홈으로" />
        </div>
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-10 text-center">
          <div className="text-stone-700 font-medium mb-1">
            아직 입력된 정보가 없습니다
          </div>
          <div className="text-sm text-stone-500 mb-4">
            온보딩에서 기본 정보를 입력하면 받을 수 있는 혜택을 자동 매칭해 드립니다.
          </div>
          <Link
            href="/benefits/onboarding"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md"
          >
            정보 입력 시작
          </Link>
        </div>
      </div>
    );
  }

  const { total, items } = await getMatches(profile.id, f);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/benefits"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 정부 혜택 홈으로
        </Link>
      </div>

      <header>
        <h1 className="text-2xl font-bold">내게 맞는 혜택</h1>
        <p className="text-sm text-stone-600 mt-1">
          입력하신 정보({profile.completeness}%)를 기반으로 매칭된 결과입니다. 점수가 높은
          순으로 표시됩니다.
        </p>
      </header>

      {/* 상태 필터 탭 */}
      <nav className="flex flex-wrap gap-2 border-b border-stone-200">
        {STATUS_TABS.map((tab) => {
          const active = f.status === tab.key;
          // 탭 변경 시 page는 1로 리셋
          const href = `/benefits/matches${buildQuery(f, { status: tab.key, page: 1 })}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                active
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="text-sm text-stone-600">
        총 <strong className="text-stone-900">{total.toLocaleString()}</strong>건
        {totalPages > 1 && (
          <>
            {" · "}
            {f.page} / {totalPages} 페이지
          </>
        )}
      </div>

      {items.length === 0 ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-10 text-center">
          <div className="text-stone-700 font-medium mb-1">
            조건에 맞는 매칭 결과가 없습니다
          </div>
          <div className="text-sm text-stone-500">
            다른 상태 탭을 확인하거나{" "}
            <Link href="/benefits" className="text-indigo-600 hover:underline">
              홈
            </Link>
            에서 &ldquo;다시 매칭하기&rdquo;를 실행해 보세요.
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((m) => {
            const dDays = m.benefit.applyEndAt
              ? Math.ceil(
                  (m.benefit.applyEndAt.getTime() - Date.now()) /
                    (24 * 60 * 60 * 1000),
                )
              : null;
            const catLabel = m.benefit.category
              ? categoryGroup(m.benefit.category)
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
                      {catLabel && (
                        <span className="bg-stone-100 px-2 py-0.5 rounded">
                          {catLabel}
                        </span>
                      )}
                      {m.benefit.agency && (
                        <span className="truncate">{m.benefit.agency}</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-stone-900 leading-snug line-clamp-2">
                      {stripHtml(m.benefit.title)}
                    </h3>
                  </div>
                  <ScoreBadge score={m.score} status={m.status} />
                </div>
                {m.benefit.summary && (
                  <p className="text-sm text-stone-600 line-clamp-2 mb-2">
                    {stripHtml(m.benefit.summary)}
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

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between pt-2">
          {f.page > 1 ? (
            <Link
              href={`/benefits/matches${buildQuery(f, { page: f.page - 1 })}`}
              className="text-sm bg-white border border-stone-300 hover:bg-stone-50 px-4 py-2 rounded-md"
            >
              ← 이전
            </Link>
          ) : (
            <span className="text-sm text-stone-300 border border-stone-200 px-4 py-2 rounded-md">
              ← 이전
            </span>
          )}
          <div className="text-xs text-stone-500">
            {f.page} / {totalPages}
          </div>
          {f.page < totalPages ? (
            <Link
              href={`/benefits/matches${buildQuery(f, { page: f.page + 1 })}`}
              className="text-sm bg-white border border-stone-300 hover:bg-stone-50 px-4 py-2 rounded-md"
            >
              다음 →
            </Link>
          ) : (
            <span className="text-sm text-stone-300 border border-stone-200 px-4 py-2 rounded-md">
              다음 →
            </span>
          )}
        </nav>
      )}
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
