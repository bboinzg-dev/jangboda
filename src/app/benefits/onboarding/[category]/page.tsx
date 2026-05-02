// 카테고리별 입력 폼 페이지 (서버 컴포넌트)
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { CATEGORIES, type CategoryKey } from "@/lib/benefits/types";
import CategoryForm from "@/components/benefits/CategoryForm";

export const dynamic = "force-dynamic";

// 1차 구현 카테고리
const IMPLEMENTED: CategoryKey[] = [
  "demographics",
  "residence",
  "business",
  "household",
];

type Params = { params: { category: string } };

export default async function CategoryOnboardingPage({ params }: Params) {
  const categoryParam = params.category;

  // 유효한 카테고리인지 확인
  const meta = CATEGORIES.find((c) => c.key === categoryParam);
  if (!meta) notFound();
  const category = meta.key as CategoryKey;

  // 인증 확인
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="space-y-6">
        <Link
          href="/benefits/onboarding"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 카테고리 목록으로
        </Link>
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
          <h1 className="text-xl font-bold">로그인이 필요합니다</h1>
          <p className="text-stone-600 text-sm">
            정부 혜택 매칭을 위해 입력하신 정보는 사용자 본인만 조회할 수
            있습니다. 안전하게 보관하기 위해 로그인이 필요합니다.
          </p>
          <Link
            href="/login"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium"
          >
            로그인 / 회원가입
          </Link>
        </div>
      </div>
    );
  }

  // 미구현 카테고리
  if (!IMPLEMENTED.includes(category)) {
    const idx = CATEGORIES.findIndex((c) => c.key === category);
    const next = CATEGORIES[idx + 1];
    return (
      <div className="space-y-6">
        <Link
          href="/benefits/onboarding"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 카테고리 목록으로
        </Link>
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center space-y-3">
          <div className="text-xs text-indigo-600 font-medium">
            {meta.label}
          </div>
          <h1 className="text-xl font-bold">준비 중인 카테고리</h1>
          <p className="text-stone-600 text-sm">
            이 카테고리는 곧 입력 가능해집니다. 우선 다른 카테고리를 채워주세요.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Link
              href="/benefits/onboarding"
              className="bg-white hover:bg-stone-50 border border-stone-200 px-5 py-2.5 rounded-lg font-medium"
            >
              목록으로
            </Link>
            {next && (
              <Link
                href={`/benefits/onboarding/${next.key}`}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium"
              >
                다음: {next.label}
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 기존 프로필 조회 (prefill 용)
  const profile = await prisma.benefitProfile.findUnique({
    where: { userId: user.id },
  });
  const data = (profile?.data as Record<string, unknown> | null) ?? {};
  const initialValues =
    (data[category] as Record<string, unknown> | undefined) ?? {};

  return (
    <div className="space-y-6">
      <section>
        <Link
          href="/benefits/onboarding"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 카테고리 목록으로
        </Link>
        <div className="mt-2 flex items-baseline justify-between">
          <h1 className="text-2xl font-bold">{meta.label}</h1>
          <span className="text-xs text-stone-500">
            현재 완성도: {profile?.completeness ?? 0}%
          </span>
        </div>
      </section>

      <CategoryForm category={category} initialValues={initialValues} />
    </div>
  );
}
