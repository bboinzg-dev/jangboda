// 정부 혜택 매칭 실행 API
// 사용자의 BenefitProfile을 가져와 모든 active Benefit과 매칭한 뒤
// matched/uncertain 결과만 BenefitMatch에 upsert.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { BenefitProfileSchema } from "@/lib/benefits/types";
import { evaluateBenefit } from "@/lib/benefits/matcher";

export async function POST() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  // 사용자 프로필 가져오기
  const profileRow = await prisma.benefitProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profileRow) {
    return NextResponse.json(
      { error: "혜택 프로필이 없습니다. 먼저 정보를 입력해주세요." },
      { status: 400 },
    );
  }

  // Json 필드 검증/파싱 — 없는 필드는 기본값 채움
  const parsed = BenefitProfileSchema.safeParse(profileRow.data ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "프로필 데이터 형식 오류", detail: parsed.error.issues },
      { status: 400 },
    );
  }
  const profile = parsed.data;

  // active Benefit 전체 가져오기 — 평가는 메모리에서
  // normalizedRules도 함께 조회 — matcher가 우선적으로 사용
  const benefits = await prisma.benefit.findMany({
    where: { active: true },
    select: {
      id: true,
      eligibilityRules: true,
      normalizedRules: true,
      targetType: true,
      regionCodes: true,
      applyEndAt: true,
    },
  });

  let matched = 0;
  let uncertain = 0;
  let notEligible = 0;
  let errors = 0;

  // 각 혜택을 평가해 결과 누적 — 한 건 실패해도 계속
  type Outcome = {
    benefitId: string;
    score: number;
    status: "matched" | "uncertain" | "notEligible";
    missingFields: string[];
  };
  const outcomes: Outcome[] = [];

  for (const b of benefits) {
    try {
      const result = evaluateBenefit(profile, {
        eligibilityRules: b.eligibilityRules as Record<string, unknown> | null,
        normalizedRules: b.normalizedRules as Record<string, unknown> | null,
        targetType: b.targetType,
        regionCodes: b.regionCodes ?? [],
        applyEndAt: b.applyEndAt,
      });
      if (result.status === "matched") matched++;
      else if (result.status === "uncertain") uncertain++;
      else notEligible++;

      outcomes.push({
        benefitId: b.id,
        score: result.score,
        status: result.status,
        missingFields: result.missingFields,
      });
    } catch (e) {
      errors++;
      // 한 건 실패는 전체 매칭을 막지 않음
      console.error("[benefits/match] evaluate failed", b.id, e);
    }
  }

  // matched/uncertain만 DB에 저장 (notEligible은 결과 캐시 의미 없음)
  const toUpsert = outcomes.filter(
    (o) => o.status === "matched" || o.status === "uncertain",
  );

  // 트랜잭션으로 묶어 일관성 보장. 함수형 트랜잭션 사용(timeout 옵션 지원).
  await prisma.$transaction(
    async (tx) => {
      for (const o of toUpsert) {
        await tx.benefitMatch.upsert({
          where: {
            profileId_benefitId: {
              profileId: profileRow.id,
              benefitId: o.benefitId,
            },
          },
          create: {
            profileId: profileRow.id,
            benefitId: o.benefitId,
            score: o.score,
            status: o.status,
            missingFields: o.missingFields,
          },
          update: {
            score: o.score,
            status: o.status,
            missingFields: o.missingFields,
          },
        });
      }
    },
    { timeout: 30_000 },
  );

  return NextResponse.json({
    totalEvaluated: benefits.length,
    matched,
    uncertain,
    notEligible,
    errors,
  });
}
