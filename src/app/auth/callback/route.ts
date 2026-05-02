// OAuth 로그인 후 리다이렉트되는 콜백 — Supabase가 ?code= 를 보내면 세션으로 교환
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/?auth_error=${error?.message ?? "unknown"}`);
  }

  // 우리 Prisma User 테이블에 매핑 — Supabase auth.user.id를 그대로 사용
  // 닉네임은 user_metadata.full_name 또는 email 앞부분
  const u = data.user;
  const nickname =
    (u.user_metadata?.full_name as string | undefined) ??
    (u.user_metadata?.name as string | undefined) ??
    u.email?.split("@")[0] ??
    "사용자";

  try {
    await prisma.user.upsert({
      where: { id: u.id },
      update: {},
      create: {
        id: u.id,
        nickname: `${nickname}-${u.id.slice(0, 4)}`, // 닉네임 unique 제약 회피
      },
    });
  } catch (e) {
    console.warn("[auth/callback] Prisma user upsert 실패:", e);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
