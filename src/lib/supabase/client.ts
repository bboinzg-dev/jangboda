// 브라우저(Client Component)에서 사용하는 Supabase 클라이언트
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 미설정 — Supabase 대시보드 → Settings → API에서 복사"
    );
  }
  return createBrowserClient(url, key);
}

// 인증 미설정 여부 (UI에서 안내용)
export function isAuthConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
