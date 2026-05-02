// 가격 신고 API — 사용자가 잘못된 가격에 대해 정정 요청
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { z } from "zod";

const ReportSchema = z.object({
  reason: z.string().min(1).max(200),
  suggestedPrice: z.number().int().positive().optional(),
});

// 요청 IP 추출 (rate limit 키로 사용)
function getRequestIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

// POST /api/prices/[id]/report — 가격 신고 등록
// body: { reason: string, suggestedPrice?: number }
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const priceId = params.id;
  const body = await req.json().catch(() => ({}));
  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "유효하지 않은 입력", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // 가격 존재 확인
  const exists = await prisma.price.findUnique({ where: { id: priceId } });
  if (!exists) {
    return NextResponse.json({ error: "가격을 찾을 수 없음" }, { status: 404 });
  }

  // 익명 허용 — 로그인 사용자면 reporterId 기록
  const user = await getCurrentUser();
  const reporterId = user?.id ?? null;
  const ip = getRequestIp(req);

  // Rate limit — 같은 priceId에 같은 사용자/IP 24시간 1건
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (reporterId) {
    const dup = await prisma.priceReport.findFirst({
      where: { priceId, reporterId, createdAt: { gte: since } },
    });
    if (dup) {
      return NextResponse.json(
        { error: "이미 신고하셨습니다 (24시간에 1건)" },
        { status: 429 }
      );
    }
  } else {
    // 익명 사용자는 IP를 reason 안에 prefix로 두지 않고 별도로 검사 — reason은 깨끗히 유지
    // PriceReport에 IP 컬럼이 없으므로 createdAt + reason 시작이 같은 24h 내 중복은 그냥 허용 (스키마 변경 금지)
    // 단, 같은 reason + 같은 priceId 24h 내 중복은 차단
    const dup = await prisma.priceReport.findFirst({
      where: {
        priceId,
        reporterId: null,
        reason: parsed.data.reason,
        createdAt: { gte: since },
      },
    });
    if (dup) {
      return NextResponse.json(
        { error: "이미 같은 사유로 신고된 건이 있습니다" },
        { status: 429 }
      );
    }
  }

  const report = await prisma.priceReport.create({
    data: {
      priceId,
      reporterId,
      reason: parsed.data.reason,
      suggestedPrice: parsed.data.suggestedPrice,
      status: "pending",
    },
  });

  return NextResponse.json({ ok: true, report, anonymous: !reporterId, ip });
}
