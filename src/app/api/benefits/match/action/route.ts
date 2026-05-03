// 정부 혜택 매칭 액션 API — 저장/관심없음/신청완료 토글
//
// 사용자가 BenefitMatch 행 자체가 없는 상태(매칭 미실행)에서도 저장 가능하게,
// match가 없으면 score=0/status="uncertain"인 placeholder 행을 만들고 userAction만 set.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

const ALLOWED_ACTIONS = new Set(["saved", "dismissed", "applied"]);

export async function POST(req: NextRequest) {
  const authUser = await getCurrentUser();
  if (!authUser) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const benefitId: string | undefined = body.benefitId;
  const rawAction: string | null | undefined = body.action;

  if (!benefitId || typeof benefitId !== "string") {
    return NextResponse.json({ error: "benefitId 필요" }, { status: 400 });
  }

  // null 또는 명시적 허용 액션만 통과
  let action: string | null;
  if (rawAction === null || rawAction === undefined) {
    action = null;
  } else if (typeof rawAction === "string" && ALLOWED_ACTIONS.has(rawAction)) {
    action = rawAction;
  } else {
    return NextResponse.json({ error: "유효하지 않은 action" }, { status: 400 });
  }

  // Benefit 존재 검증 (잘못된 ID로 placeholder 매칭 만들지 않게)
  const benefit = await prisma.benefit.findUnique({
    where: { id: benefitId },
    select: { id: true },
  });
  if (!benefit) {
    return NextResponse.json({ error: "존재하지 않는 혜택" }, { status: 404 });
  }

  // User 보장 (favorites 라우트와 동일 패턴)
  await prisma.user.upsert({
    where: { id: authUser.id },
    update: {},
    create: {
      id: authUser.id,
      nickname: `사용자-${authUser.id.slice(0, 4)}`,
    },
  });

  // BenefitProfile 보장 — 매칭 미실행 사용자도 저장 가능하게 빈 프로필 만든다
  const profile = await prisma.benefitProfile.upsert({
    where: { userId: authUser.id },
    update: {},
    create: { userId: authUser.id, data: {} },
  });

  // BenefitMatch upsert — 행이 없으면 placeholder 생성, 있으면 userAction만 갱신
  const match = await prisma.benefitMatch.upsert({
    where: {
      profileId_benefitId: { profileId: profile.id, benefitId },
    },
    update: { userAction: action },
    create: {
      profileId: profile.id,
      benefitId,
      score: 0,
      status: "uncertain",
      missingFields: [],
      userAction: action,
    },
    select: { userAction: true },
  });

  return NextResponse.json({ ok: true, userAction: match.userAction });
}
