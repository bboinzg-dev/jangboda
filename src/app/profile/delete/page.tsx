// 회원 탈퇴 — 별도 페이지 (1-클릭 사고 방지). 닉네임 재입력 confirm.
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import DeleteAccountForm from "./_components/DeleteAccountForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "회원 탈퇴 — 장보다",
};

export default async function ProfileDeletePage() {
  const authUser = await getCurrentUser();
  if (!authUser) redirect("/?auth_error=login_required");

  const me = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      nickname: true,
      _count: {
        select: { receipts: true, prices: true, favorites: true, pushSubs: true },
      },
    },
  });

  if (!me) {
    // 이미 삭제된 사용자 (예: 새로고침)
    return (
      <div className="max-w-xl mx-auto py-10 text-center">
        <h1 className="text-xl font-bold text-ink-1">탈퇴 처리됨</h1>
        <p className="text-sm text-ink-3 mt-2">
          이미 본인 데이터가 삭제됐어요.
        </p>
        <Link
          href="/"
          className="inline-block mt-4 px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-bold"
        >
          홈으로
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-6 space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-1">회원 탈퇴</h1>
        <p className="text-sm text-ink-3 mt-1">
          탈퇴를 진행하기 전에 아래 내용을 확인해주세요.
        </p>
      </header>

      <section className="bg-warning-soft border border-warning text-warning-text rounded-2xl p-4 text-sm space-y-2">
        <div className="font-bold">즉시 삭제되는 정보</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>가계부 카테고리 정정 / 즐겨찾기 매장 ({me._count.favorites}개)</li>
          <li>혜택 매칭 프로필 (출생연도·거주지·가구 형태 등 입력 정보)</li>
          <li>혜택 저장·매칭 결과</li>
          <li>가격 알림 설정 / 푸시 구독 단말 ({me._count.pushSubs}개)</li>
          <li>본인이 올린 영수증 이미지·OCR 텍스트 ({me._count.receipts}장)</li>
          <li>월 예산 설정</li>
        </ul>
      </section>

      <section className="bg-surface-muted border border-line rounded-2xl p-4 text-sm space-y-2">
        <div className="font-bold text-ink-1">익명 보존되는 정보</div>
        <p className="text-ink-2">
          본인이 등록한 가격·매장 정보({me._count.prices}건)는{" "}
          <strong>등록자 정보를 익명화한 뒤</strong> 다른 사용자의 가격 비교에
          계속 활용됩니다. 사용자를 다시 식별할 수 없는 형태로 보존됩니다.
        </p>
      </section>

      <DeleteAccountForm nickname={me.nickname} />

      <div className="text-center">
        <Link
          href="/profile"
          className="text-sm text-ink-3 hover:underline"
        >
          ← 그만두기
        </Link>
      </div>
    </div>
  );
}
