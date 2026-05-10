// 관리자 게이팅 — Supabase auth로 인증된 사용자 중 User.role === "admin"만 통과
// 비관리자는 notFound() 처리 (관리자 페이지 존재 자체를 노출하지 않음)
//
// 사용:
//   const admin = await requireAdmin();  // 통과 시 { id, nickname } 반환
//   // 차단 시 자동으로 notFound() 호출됨

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";

export type AdminUser = {
  id: string;
  nickname: string;
};

/** 관리자만 통과. 그 외(미로그인, 일반 사용자)는 notFound() — 관리자 페이지 존재를 숨김. */
export async function requireAdmin(): Promise<AdminUser> {
  const supaUser = await getCurrentUser();
  if (!supaUser) notFound();

  const dbUser = await prisma.user.findUnique({
    where: { id: supaUser.id },
    select: { id: true, nickname: true, role: true },
  });
  if (!dbUser || dbUser.role !== "admin") notFound();

  return { id: dbUser.id, nickname: dbUser.nickname };
}

/** 현재 사용자가 관리자인지 boolean으로만 확인 (UI 분기용). */
export async function isAdmin(): Promise<boolean> {
  const supaUser = await getCurrentUser();
  if (!supaUser) return false;
  const dbUser = await prisma.user.findUnique({
    where: { id: supaUser.id },
    select: { role: true },
  });
  return dbUser?.role === "admin";
}
