// 저장한 혜택 목록 — userAction === "saved"인 BenefitMatch만 노출
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import BackButton from "@/components/benefits/BackButton";
import BenefitCard from "@/components/benefits/BenefitCard";

export const dynamic = "force-dynamic";

async function getSavedMatches(userId: string) {
  const profile = await prisma.benefitProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) return [];

  const matches = await prisma.benefitMatch.findMany({
    where: { profileId: profile.id, userAction: "saved" },
    orderBy: { updatedAt: "desc" },
    include: {
      benefit: {
        select: {
          id: true,
          title: true,
          summary: true,
          agency: true,
          category: true,
          sourceCode: true,
          applyEndAt: true,
        },
      },
    },
  });

  return matches;
}

export default async function SavedBenefitsPage() {
  const user = await getCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <BackButton fallbackHref="/benefits" fallbackLabel="정부 혜택 홈으로" />
      </div>

      <header>
        <h1 className="text-2xl font-bold text-stone-900">저장한 혜택</h1>
        <p className="text-sm text-stone-600 mt-1">
          나중에 다시 볼 혜택을 모아둔 곳이에요.
        </p>
      </header>

      {!user ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
          <div className="text-stone-700 mb-2">
            로그인하면 저장한 혜택을 볼 수 있어요.
          </div>
          <Link
            href="/login"
            className="inline-block mt-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            로그인하러 가기
          </Link>
        </div>
      ) : (
        <SavedList userId={user.id} />
      )}
    </div>
  );
}

async function SavedList({ userId }: { userId: string }) {
  const matches = await getSavedMatches(userId);

  if (matches.length === 0) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-8 text-center">
        <div className="text-stone-700 mb-2">아직 저장한 혜택이 없어요</div>
        <div className="text-xs text-stone-500 mb-4">
          마음에 드는 혜택을 ★ 저장하면 여기에 모입니다.
        </div>
        <Link
          href="/benefits/catalog"
          className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          전체 혜택 둘러보기 →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {matches.map((m) => (
        <BenefitCard
          key={m.id}
          href={`/benefits/${m.benefit.id}`}
          title={m.benefit.title}
          summary={m.benefit.summary}
          agency={m.benefit.agency}
          category={m.benefit.category}
          sourceCode={m.benefit.sourceCode}
          applyEndAt={m.benefit.applyEndAt}
        />
      ))}
    </div>
  );
}
