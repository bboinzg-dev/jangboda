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
    // 1) 외부 이미지 fetch
    const res = await fetch(sourceUrl, {
      // 네이버 등 일부는 referer 검증 — 우리가 한 번 우회 시도
      headers: { "User-Agent": "Mozilla/5.0 (jangboda price comparison)" },
      cache: "no-store",
    });
    if (!res.ok) return null;
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
