// 즐겨찾기 매장 API
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

// GET /api/favorites — 내 즐겨찾기 목록
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const favorites = await prisma.favoriteStore.findMany({
    where: { userId: user.id },
    include: {
      store: { include: { chain: true, _count: { select: { prices: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    favorites: favorites.map((f) => ({
      id: f.id,
      storeId: f.storeId,
      group: f.group,
      createdAt: f.createdAt,
      store: {
        id: f.store.id,
        name: f.store.name,
        chainName: f.store.chain.name,
        chainCategory: f.store.chain.category,
        address: f.store.address,
        lat: f.store.lat,
        lng: f.store.lng,
        priceCount: f.store._count.prices,
      },
    })),
  });
}

// POST /api/favorites { storeId } — 즐겨찾기 추가
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const storeId: string | undefined = body.storeId;
  if (!storeId) return NextResponse.json({ error: "storeId 필요" }, { status: 400 });

  // User 보장 (Supabase id로 등록 안 됐을 가능성)
  await prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: { id: user.id, nickname: `사용자-${user.id.slice(0, 4)}` },
  });

  const fav = await prisma.favoriteStore.upsert({
    where: { userId_storeId: { userId: user.id, storeId } },
    update: {},
    create: { userId: user.id, storeId },
  });

  return NextResponse.json({ ok: true, id: fav.id });
}

// DELETE /api/favorites?storeId=... — 해제
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get("storeId");
  if (!storeId) return NextResponse.json({ error: "storeId 필요" }, { status: 400 });

  await prisma.favoriteStore.deleteMany({
    where: { userId: user.id, storeId },
  });
  return NextResponse.json({ ok: true });
}
