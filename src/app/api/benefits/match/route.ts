// 정부 혜택 매칭 실행 API
// 사용자의 BenefitProfile을 가져와 모든 active Benefit과 매칭한 뒤
// matched/uncertain 결과만 BenefitMatch에 upsert.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { BenefitProfileSchema } from "@/lib/benefits/types";
import { evaluateBenefit } from "@/lib/benefits/matcher";

export async function POST() {
  try {
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
    const toSave = outcomes.filter(
      (o) => o.status === "matched" || o.status === "uncertain",
    );

    // deleteMany + createMany로 단순화 — 250건 sequential upsert는 Vercel 환경에서
    // 트랜잭션 timeout 위험. 멱등성은 (profileId 기준 전체 삭제 후 재생성)으로 보장.
    // (사용자 액션 userAction/notifiedAt은 손실 — 추후 개선 시 보존 로직 추가)
    await prisma.$transaction(
      async (tx) => {
        await tx.benefitMatch.deleteMany({
          where: { profileId: profileRow.id },
        });
        if (toSave.length > 0) {
          await tx.benefitMatch.createMany({
            data: toSave.map((o) => ({
              profileId: profileRow.id,
              benefitId: o.benefitId,
              score: o.score,
              status: o.status,
              missingFields: o.missingFields,
            })),
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
  } catch (e) {
    // 에러 메시지를 응답에 포함 — Vercel 로그 안 봐도 원인 추적 가능
    console.error("[benefits/match] fatal", e);
    return NextResponse.json(
      {
        error: "매칭 처리 중 오류",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
