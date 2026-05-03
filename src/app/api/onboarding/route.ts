import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

// GET /api/onboarding — 홈 페이지 OnboardingCard용 client-side fetch
// 페이지 자체는 cookies() 호출 없이 ISR 정적, 사용자별 데이터는 여기서 fetch
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ authed: false }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  const [favorites, receipts, prices] = await Promise.all([
    prisma.favoriteStore.count({ where: { userId: user.id } }),
    prisma.receipt.count({ where: { uploaderId: user.id } }),
    prisma.price.count({ where: { contributorId: user.id } }),
  ]);
  return NextResponse.json(
    { authed: true, status: { favorites, receipts, prices } },
    { headers: { "Cache-Control": "private, max-age=10" } }
  );
}
