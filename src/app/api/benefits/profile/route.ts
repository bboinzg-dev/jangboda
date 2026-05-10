// 정부 혜택 프로필 API — 카테고리 단위 patch
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  BenefitProfileSchema,
  CATEGORIES,
  computeCompleteness,
  type CategoryKey,
} from "@/lib/benefits/types";
import { kstCurrentYear } from "@/lib/kst";

// 카테고리 키 → 해당 sub-schema 매핑 (BenefitProfileSchema의 shape 활용)
const CATEGORY_KEYS = new Set<string>(CATEGORIES.map((c) => c.key));
const SHAPE = BenefitProfileSchema.shape;

// 만 14세 미만 차단 — 개인정보보호법 §22의2 (법정대리인 동의 부재 시 가입 거부)
// birthYear만 있는 단순 계산이라 한국식 만 나이 정확도는 약하지만 보수적(올해-출생연도)으로 충분.
const MIN_AGE = 14;

// GET /api/benefits/profile — 현재 사용자 프로필 (없으면 빈 객체)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const profile = await prisma.benefitProfile.findUnique({
    where: { userId: user.id },
  });

  if (!profile) {
    return NextResponse.json({
      data: {},
      completeness: 0,
      birthYear: null,
      regionCode: null,
      hasBusiness: false,
    });
  }

  return NextResponse.json({
    data: profile.data ?? {},
    completeness: profile.completeness,
    birthYear: profile.birthYear,
    regionCode: profile.regionCode,
    hasBusiness: profile.hasBusiness,
    updatedAt: profile.updatedAt,
  });
}

// POST /api/benefits/profile { category, values } — 카테고리 단위 patch
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const category: string | undefined = body?.category;
  const values: Record<string, unknown> | undefined = body?.values;

  if (!category || !CATEGORY_KEYS.has(category)) {
    return NextResponse.json(
      { error: "유효하지 않은 카테고리" },
      { status: 400 }
    );
  }
  if (!values || typeof values !== "object") {
    return NextResponse.json({ error: "values 필요" }, { status: 400 });
  }

  // 만 14세 미만 차단 — 출생연도 입력 시 즉시 거부 (PIPA §22의2)
  if (category === "demographics" && typeof values.birthYear === "number") {
    const age = kstCurrentYear() - values.birthYear;
    if (age < MIN_AGE) {
      return NextResponse.json(
        {
          error: "만 14세 미만은 가입할 수 없어요",
          hint: "법정대리인(부모님 등) 동의 절차가 마련되기 전까지 14세 미만 사용자의 개인정보를 받지 않습니다.",
        },
        { status: 403 },
      );
    }
  }

  // 해당 카테고리의 sub-schema로 검증
  const subSchema = SHAPE[category as CategoryKey];
  let parsed: Record<string, unknown>;
  try {
    parsed = subSchema.parse(values) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "입력값 검증 실패",
          issues: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "검증 오류" }, { status: 400 });
  }

  // User 보장 (Supabase id로 등록 안 됐을 가능성)
  await prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id, nickname: `사용자-${user.id.slice(0, 4)}` },
  });

  // 기존 프로필 데이터 조회 후 카테고리만 patch
  const existing = await prisma.benefitProfile.findUnique({
    where: { userId: user.id },
  });
  const existingData = (existing?.data as Record<string, unknown> | null) ?? {};
  const mergedData: Record<string, unknown> = {
    ...existingData,
    [category]: parsed,
  };

  // 인덱스 컬럼 동기화
  const demographics =
    (mergedData.demographics as Record<string, unknown> | undefined) ?? {};
  const residence =
    (mergedData.residence as Record<string, unknown> | undefined) ?? {};
  const business =
    (mergedData.business as Record<string, unknown> | undefined) ?? {};

  const birthYear =
    typeof demographics.birthYear === "number"
      ? (demographics.birthYear as number)
      : null;
  const regionCode =
    typeof residence.regionCode === "string"
      ? (residence.regionCode as string)
      : null;
  const hasBusiness =
    typeof business.hasBusiness === "boolean"
      ? (business.hasBusiness as boolean)
      : false;

  // 완성도 재계산
  const completeness = computeCompleteness(mergedData as never);

  // Prisma Json 필드 타입 캐스팅
  const dataForPrisma = mergedData as Prisma.InputJsonValue;

  const saved = await prisma.benefitProfile.upsert({
    where: { userId: user.id },
    update: {
      data: dataForPrisma,
      birthYear,
      regionCode,
      hasBusiness,
      completeness,
    },
    create: {
      userId: user.id,
      data: dataForPrisma,
      birthYear,
      regionCode,
      hasBusiness,
      completeness,
    },
  });

  return NextResponse.json({
    ok: true,
    completeness: saved.completeness,
    category,
  });
}
