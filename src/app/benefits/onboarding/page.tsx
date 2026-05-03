import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { CATEGORIES } from "@/lib/benefits/types";
import BackButton from "@/components/benefits/BackButton";

export const dynamic = "force-dynamic";

const PRIORITY_LABELS: Record<number, { title: string; desc: string }> = {
  1: { title: "필수 정보", desc: "기본 매칭에 꼭 필요해요" },
  2: { title: "권장 정보", desc: "입력하면 매칭이 정확해져요" },
  3: { title: "추가 정보", desc: "받을 수 있는 혜택이 더 늘어나요" },
  4: { title: "선택 정보", desc: "특수 자격이 있으면 입력하세요" },
};

// 카테고리 안에 채워진 (의미 있는) 필드 수 세기
function countFilled(section: unknown): number {
  if (!section || typeof section !== "object") return 0;
  return Object.values(section as Record<string, unknown>).filter(
    (v) =>
      v !== undefined &&
      v !== null &&
      v !== "" &&
      !(Array.isArray(v) && v.length === 0),
  ).length;
}

export default async function BenefitsOnboardingPage() {
  // TODO(포인트 게이팅): 활성화 시 canAccessBenefits() 호출
  const user = await getCurrentUser();
  const profile = user
    ? await prisma.benefitProfile.findUnique({
        where: { userId: user.id },
        select: { data: true, completeness: true },
      })
    : null;

  const profileData = (profile?.data ?? {}) as Record<string, unknown>;
  const completeness = profile?.completeness ?? 0;

  const grouped = new Map<number, typeof CATEGORIES[number][]>();
  for (const cat of CATEGORIES) {
    if (!grouped.has(cat.priority)) grouped.set(cat.priority, []);
    grouped.get(cat.priority)!.push(cat);
  }

  return (
    <div className="space-y-8">
      <section>
        <BackButton fallbackHref="/benefits" fallbackLabel="정부 혜택 홈으로" />
        <h1 className="text-2xl font-bold mt-2 mb-1">정보 입력</h1>
        <p className="text-stone-600 text-sm">
          입력한 정보로 받을 수 있는 혜택을 매칭합니다. 처음에는 필수 정보만 입력해도
          되고, 더 정확한 매칭을 원하면 모든 카테고리를 채워주세요.
        </p>
      </section>

      {/* 전체 진행률 — 로그인 사용자만 */}
      {user && (
        <section className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm font-medium text-indigo-900">
              전체 입력 완성도
            </span>
            <span className="text-lg font-bold text-indigo-700">
              {completeness}%
            </span>
          </div>
          <div className="w-full bg-white rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${completeness}%` }}
            />
          </div>
        </section>
      )}

      <section className="space-y-6">
        {[1, 2, 3, 4].map((priority) => {
          const cats = grouped.get(priority) ?? [];
          if (cats.length === 0) return null;
          const meta = PRIORITY_LABELS[priority];
          return (
            <div key={priority}>
              <div className="mb-3">
                <h2 className="text-lg font-bold text-stone-900">{meta.title}</h2>
                <p className="text-xs text-stone-500">{meta.desc}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cats.map((cat) => {
                  const filled = countFilled(profileData[cat.key]);
                  const total = cat.coreFields;
                  const isComplete = filled >= total;
                  const isStarted = filled > 0;
                  return (
                    <Link
                      key={cat.key}
                      href={`/benefits/onboarding/${cat.key}`}
                      className={`rounded-lg p-4 transition border ${
                        isComplete
                          ? "bg-indigo-50 border-indigo-300 hover:border-indigo-500"
                          : isStarted
                          ? "bg-white border-indigo-200 hover:border-indigo-400"
                          : "bg-white border-stone-200 hover:border-indigo-400 hover:bg-indigo-50/30"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{cat.label}</span>
                            {isComplete && (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-1.5 py-0.5 rounded">
                                완료
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-stone-500 mt-0.5">
                            {filled} / {total} 입력됨
                          </div>
                        </div>
                        <div className="text-stone-400">›</div>
                      </div>
                      {/* 카테고리별 미니 진행 바 */}
                      <div className="mt-2 w-full bg-stone-100 rounded-full h-1 overflow-hidden">
                        <div
                          className={`h-1 rounded-full transition-all ${
                            isComplete ? "bg-indigo-600" : "bg-indigo-400"
                          }`}
                          style={{
                            width: `${Math.min(100, (filled / total) * 100)}%`,
                          }}
                        />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <section className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-xs text-stone-500">
        <strong className="text-stone-700">개인정보 처리 안내:</strong> 입력하신
        정보는 혜택 매칭 외 다른 목적으로 사용되지 않으며, 사용자만 조회할 수
        있습니다. 제3자 제공 없음.
      </section>
    </div>
  );
}
