// Supabase Storage 헬퍼 — 영수증 이미지 업로드
// bucket "receipts" 사용 (Public read, 인증 사용자 insert 권장)
// bucket이 없으면 안내 메시지와 함께 throw → 호출자가 catch해서 fallback 처리
import { createClient } from "@/lib/supabase/server";

const BUCKET = "receipts";

// base64 데이터 URL 또는 raw base64 문자열을 Buffer로 변환
function base64ToBuffer(input: string): Buffer {
  // "data:image/jpeg;base64,xxxx" 형태면 prefix 제거
  const cleaned = input.includes(",") ? input.split(",")[1] : input;
  return Buffer.from(cleaned, "base64");
}

// 랜덤 파일명 생성 (timestamp + random)
function makeRandomName(ext: "jpg" | "png"): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}.${ext}`;
}

/**
 * 영수증 이미지를 Supabase Storage에 업로드.
 * @param base64 base64 문자열 (data URL prefix 있어도 됨)
 * @param ext 확장자 (jpg | png), 기본 jpg
 * @returns publicUrl + path
 * @throws 환경변수 미설정 또는 bucket 미존재 또는 업로드 실패 시
 */
export async function uploadReceiptImage(
  base64: string,
  ext: "jpg" | "png" = "jpg"
): Promise<{ publicUrl: string; path: string }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase 환경변수 미설정");
  }

  const supabase = createClient();

  // 사용자 식별 — 로그인 사용자면 user.id, 아니면 "anon"
  let userDir = "anon";
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user?.id) userDir = data.user.id;
  } catch {
    // 비로그인 → anon
  }

  const filename = makeRandomName(ext);
  const path = `${userDir}/${filename}`;
  const buffer = base64ToBuffer(base64);
  const contentType = ext === "png" ? "image/png" : "image/jpeg";

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadErr) {
    // bucket이 없으면 명확한 안내
    const msg = uploadErr.message || "";
    if (msg.toLowerCase().includes("bucket") && msg.toLowerCase().includes("not found")) {
      throw new Error(
        `Supabase Storage bucket "${BUCKET}"가 없습니다. ` +
          `Supabase 대시보드 → Storage → New bucket → "${BUCKET}" (Public) 생성 후 다시 시도하세요.`
      );
    }
    throw new Error(`Storage 업로드 실패: ${msg}`);
  }

  // public URL 가져오기 (bucket이 Public이어야 함)
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) {
    throw new Error("Public URL 생성 실패 — bucket이 Public인지 확인하세요");
  }

  return { publicUrl: pub.publicUrl, path };
}
