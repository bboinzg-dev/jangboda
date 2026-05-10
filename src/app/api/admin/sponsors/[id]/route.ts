// 관리자 — 개별 후원 슬롯 토글/삭제
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  active: z.boolean().optional(),
  weight: z.number().int().min(-100).max(100).optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  const raw = await req.json().catch(() => ({}));
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "잘못된 입력" }, { status: 400 });
  }

  try {
    await prisma.sponsorSlot.update({
      where: { id: params.id },
      data: {
        ...parsed.data,
        endsAt:
          parsed.data.endsAt === undefined
            ? undefined
            : parsed.data.endsAt
              ? new Date(parsed.data.endsAt)
              : null,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logError("api/admin/sponsors PATCH", e, { id: params.id });
    return NextResponse.json({ error: "수정 실패" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  try {
    await prisma.sponsorSlot.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logError("api/admin/sponsors DELETE", e, { id: params.id });
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }
}
