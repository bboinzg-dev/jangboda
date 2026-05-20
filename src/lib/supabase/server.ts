// 서버(Server Component / Route Handler)에서 사용하는 Supabase 클라이언트
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Next 15+에서 cookies()는 async — createClient도 async 함수로 전환.
// 모든 server-side 호출자는 await createClient() 패턴 사용해야 함.
export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 미설정");
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component에서 set 호출 시 안전하게 무시 (middleware에서 처리)
        }
      },
    },
  });
}

// 현재 로그인 사용자 정보 (없으면 null)
export async function getCurrentUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}
