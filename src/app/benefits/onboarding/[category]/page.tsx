// 카테고리별 입력 폼 페이지 (서버 컴포넌트)
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { CATEGORIES, type CategoryKey } from "@/lib/benefits/types";
import CategoryForm from "@/components/benefits/CategoryForm";

export const dynamic = "force-dynamic";

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
        <div className="card p-8 text-center space-y-3">
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
