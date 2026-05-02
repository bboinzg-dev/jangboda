import { NextRequest, NextResponse } from "next/server";
import {
  IDPHOTO_COOKIE,
  makeCookieValue,
  verifyPassword,
} from "@/lib/idphoto/auth";

// POST /api/idphoto/auth — 비밀번호 검증 + httpOnly 쿠키 발급
// 본문: { password: string }
// 200: { ok: true }
// 401: { error: "비밀번호가 올바르지 않습니다." }
export async function POST(req: NextRequest) {
  let body: { password?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const password =
    typeof body.password === "string" ? body.password : "";

  if (!verifyPassword(password)) {
    return NextResponse.json(
      { error: "비밀번호가 올바르지 않습니다." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: IDPHOTO_COOKIE.name,
    value: makeCookieValue(),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: IDPHOTO_COOKIE.maxAge,
  });
  return res;
}

// DELETE /api/idphoto/auth — 잠금 해제 취소 (테스트/로그아웃용)
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: IDPHOTO_COOKIE.name,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
