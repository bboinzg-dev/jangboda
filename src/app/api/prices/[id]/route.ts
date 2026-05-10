// 사용자가 가계부/프로필에서 잘못 등록된 자기 가격을 삭제
// — 본인이 contributor 이거나, 본인 영수증에서 파생된 가격만 삭제 가능
// — 영수증 OCR 매칭 오류로 잘못 들어온 행을 사용자가 1초에 정정할 수 있도록
//
// 멱등 — 이미 삭제된 id면 404
import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { logError } from "@/lib/observability";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  }

  const price = await prisma.price.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      productId: true,
      storeId: true,
      contributorId: true,
      receipt: { select: { uploaderId: true } },
    },
  });
  if (!price) {
    return NextResponse.json({ error: "이미 삭제됨" }, { status: 404 });
  }

  // 본인이 직접 등록했거나, 본인 영수증에서 만들어진 가격만 삭제 가능
  const ownedDirect = price.contributorId === user.id;
  const ownedViaReceipt = price.receipt?.uploaderId === user.id;
  if (!ownedDirect && !ownedViaReceipt) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  try {
    await prisma.price.delete({ where: { id: price.id } });
  } catch (e) {
    logError("api/prices/[id] DELETE", e, { priceId: price.id });
    return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
  }

  // 영향받은 페이지 캐시 무효화 — 가계부·매장·상품
  try {
    revalidatePath("/budget");
    revalidatePath(`/products/${price.productId}`);
    if (price.storeId) revalidatePath(`/stores/${price.storeId}`);
  } catch {
    // SWR 주기에 자연 갱신
  }

  return NextResponse.json({ ok: true });
}
