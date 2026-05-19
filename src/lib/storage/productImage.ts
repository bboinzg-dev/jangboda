// 상품 이미지 자체 호스팅 헬퍼
// 외부 이미지 URL(네이버 등)을 fetch → Supabase Storage 업로드 → public URL 반환
// bucket: "product-images" (public read)
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "product-images";

// service role 키로 admin client 생성 (RLS 우회 + bucket 관리 권한)
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// SSRF 방어 — 사용자/외부에서 들어온 sourceUrl을 fetch하기 전 검증.
// 호스트가 IP라면 프라이빗/링크로컬 대역(127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fe80::)
// 차단. 도메인이면 통과 (도메인 → 프라이빗 IP DNS rebinding은 Vercel 환경에선 비실용적).
function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isSafeSourceUrl(rawUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname;
  // IPv6 리터럴(대괄호 포함) → 가장 안전한 정책으로 차단
  if (host.startsWith("[") || host.includes(":")) return false;
  if (host === "localhost") return false;
  if (isPrivateIpv4(host)) return false;
  return true;
}

/**
 * 외부 이미지 URL을 Supabase Storage에 다운로드 후 public URL 반환
 * @param productId Product.id (파일명에 사용)
 * @param sourceUrl 외부 URL (네이버 등)
 * @returns Supabase public URL 또는 null (실패)
 */
export async function downloadProductImage(
  productId: string,
  sourceUrl: string
): Promise<string | null> {
  try {
    // 0) SSRF 검증 — 프라이빗 IP/localhost/비-HTTP 차단
    if (!isSafeSourceUrl(sourceUrl)) return null;

    // 1) 외부 이미지 fetch — redirect는 따라가되 최종 응답만 사용 (수동 검증은 fetch가 미지원)
    //    timeout 8초로 hang 방지
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(sourceUrl, {
        // 네이버 등 일부는 referer 검증 — 우리가 한 번 우회 시도
        headers: { "User-Agent": "Mozilla/5.0 (jangboda price comparison)" },
        cache: "no-store",
        redirect: "follow",
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return null;
    // 최종 URL도 한 번 더 검증 — redirect 후 프라이빗으로 이동했을 가능성 차단
    if (res.url && res.url !== sourceUrl && !isSafeSourceUrl(res.url)) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return null; // max 5MB

    // 2) 확장자 결정
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const path = `${productId}.${ext}`;

    // 3) Supabase Storage upload (overwrite 허용)
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType, upsert: true });
    if (upErr) {
      console.warn("[productImage] upload error:", upErr.message);
      return null;
    }

    // 4) public URL 받기
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.warn("[productImage] error:", e);
    return null;
  }
}

/**
 * bucket 자동 생성 (idempotent — 이미 있으면 무시)
 * service role 키 권한 부족 시 throw 안 하고 조용히 무시 → 호출자가 수동 생성
 */
export async function ensureProductImagesBucket(): Promise<void> {
  try {
    await admin.storage.createBucket(BUCKET, { public: true });
  } catch {
    // 이미 있음 또는 권한 부족 — 무시
  }
}
