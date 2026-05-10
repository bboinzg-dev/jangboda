// 회원 탈퇴 — DELETE /api/me
// 개인정보보호법 §39의6 (회원 탈퇴를 가입과 동등한 수준으로 제공할 의무)
//
// 삭제 범위 (PIPA §21 — 목적 달성/탈퇴 시 지체 없이 파기):
//   - User 본체 (cascade로 BenefitProfile, BenefitMatch, BudgetGoal,
//     FavoriteStore, PriceAlert, PushSubscription 자동 삭제)
//   - Receipt: uploaderId만 익명화 (가격 데이터는 다른 사용자 비교에 활용 — 통계적 익명화)
//   - Price: contributorId만 익명화 (이미 익명 통계용)
//
// Supabase Auth 사용자 자체는 service_role 키 필요 (현재 anon key만 사용 중) →
// Auth row는 별도 cron 또는 향후 service_role 도입 시 일괄 정리.
// 사용자 입장에선 본인 데이터 모두 즉시 삭제 + 로그아웃 → 사실상 탈퇴 완료.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { logError, logEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 가격·영수증의 contributor/uploader 익명화 (가격 비교 데이터는 보존)
      await tx.price.updateMany({
        where: { contributorId: user.id },
        data: { contributorId: null },
      });
      await tx.receipt.updateMany({
        where: { uploaderId: user.id },
        data: {
          uploaderId: null,
          // 영수증 원본 이미지·OCR 텍스트는 개인정보 — 즉시 폐기
          imageUrl: "",
          storagePath: null,
          imageHash: null,
          rawOcrText: null,
          parsedJson: null,
        },
      });

      // User 삭제 — schema cascade로 본인 종속 데이터 자동 제거
      // (BenefitProfile, BenefitMatch, BudgetGoal, FavoriteStore,
      //  PriceAlert, PushSubscription)
      await tx.user.delete({ where: { id: user.id } }).catch(() => {
        // 이미 삭제된 경우 무시 (멱등)
      });
    });

    logEvent("user_deleted", { userId: user.id });
  } catch (e) {
    logError("api/me DELETE", e, { userId: user.id });
    return NextResponse.json(
      {
        error: "탈퇴 처리 중 오류",
        hint: "잠시 후 다시 시도해주세요. 계속되면 문의해주세요.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      "탈퇴가 완료됐어요. 본인 가계부·즐겨찾기·혜택 프로필·푸시 구독은 즉시 삭제됐고, " +
      "익명으로 등록한 가격 비교 데이터는 다른 사용자 통계용으로 익명 보존돼요.",
  });
}
