// 관리자 — 후원 슬롯 등록/조회
// 모든 admin route는 requireAdmin로 게이팅
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  placement: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  body: z.string().max(500).nullable().optional(),
  imageUrl: z.string().url().max(2048).nullable().optional(),
  ctaLabel: z.string().min(1).max(20).default("자세히 보기"),
  href: z.string().url().max(2048),
  notes: z.string().max(500).nullable().optional(),
  weight: z.number().int().min(-100).max(100).default(0),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

export async function POST(req: NextRequest) {
  await requireAdmin();
  const raw = await req.json().catch(() => ({}));
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 입력" }, { status: 400 });
  }

  try {
    const created = await prisma.sponsorSlot.create({
      data: {
        ...parsed.data,
        startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : null,
        endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
      },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    logError("api/admin/sponsors POST", e);
    return NextResponse.json({ error: "저장 실패" }, { status: 500 });
  }
}
