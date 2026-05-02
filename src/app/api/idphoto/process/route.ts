import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { IDPHOTO_COOKIE, isCookieValid } from "@/lib/idphoto/auth";
import {
  PHOTO_SPECS,
  getPrompt,
  isBackgroundAllowed,
  BACKGROUND_OPTIONS,
  type BackgroundKey,
} from "@/lib/idphoto/specs";
import { callGeminiForIdPhoto } from "@/lib/idphoto/gemini";

// 큰 이미지 처리를 위해 body 크기 제한 명시.
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 클라이언트가 전송하는 base64 디코딩 후 8MB
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const VALID_BG_KEYS = new Set<string>(BACKGROUND_OPTIONS.map((b) => b.key));

// POST /api/idphoto/process
// 본문(JSON):
//   { typeIdx: number (0-9), backgroundKey?: string, imageBase64: string, mimeType: string }
//   imageBase64 는 data: 접두어 없이 순수 base64.
// 응답: { imageBase64, mimeType, spec, backgroundKey }
export async function POST(req: NextRequest) {
  // 1) 쿠키 게이트 — 통과해야만 Gemini API(유료) 호출
  const cookie = cookies().get(IDPHOTO_COOKIE.name)?.value;
  if (!isCookieValid(cookie)) {
    return NextResponse.json(
      { error: "비밀번호 인증이 필요합니다." },
      { status: 401 },
    );
  }

  // 2) 본문 파싱
  let body: {
    typeIdx?: unknown;
    backgroundKey?: unknown;
    imageBase64?: unknown;
    mimeType?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청 본문입니다." },
      { status: 400 },
    );
  }

  const typeIdx =
    typeof body.typeIdx === "number" && Number.isFinite(body.typeIdx)
      ? Math.floor(body.typeIdx)
      : -1;
  const rawBgKey =
    typeof body.backgroundKey === "string" ? body.backgroundKey : "white";
  const backgroundKey: BackgroundKey = (
    VALID_BG_KEYS.has(rawBgKey) ? rawBgKey : "white"
  ) as BackgroundKey;
  const imageBase64 =
    typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const mimeType =
    typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";

  if (typeIdx < 0 || typeIdx >= PHOTO_SPECS.length) {
    return NextResponse.json(
      { error: "사진 종류 선택이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  // 정책 검증 — 클라이언트가 우회해 strict_white 종류에 다른 색을 보내도 거부
  const spec = PHOTO_SPECS[typeIdx];
  if (!isBackgroundAllowed(spec.backgroundPolicy, backgroundKey)) {
    return NextResponse.json(
      {
        error: `「${spec.name}」 규정상 선택한 배경색은 사용할 수 없습니다.`,
      },
      { status: 400 },
    );
  }

  if (!imageBase64) {
    return NextResponse.json(
      { error: "이미지가 전송되지 않았습니다." },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIMES.has(mimeType)) {
    return NextResponse.json(
      { error: "지원하지 않는 이미지 형식입니다. (JPEG/PNG/WEBP만 지원)" },
      { status: 400 },
    );
  }

  // 3) base64 크기 검증 — 클라이언트에서 압축한다는 전제이지만 서버에서도 한 번 더 막음
  const approxBytes = Math.floor((imageBase64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "이미지 용량이 너무 큽니다. (8MB 이하로 압축 후 전송)" },
      { status: 413 },
    );
  }

  // 4) Gemini 호출
  const prompt = getPrompt(spec, backgroundKey);

  try {
    const result = await callGeminiForIdPhoto(imageBase64, mimeType, prompt);
    return NextResponse.json({
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
      backgroundKey,
      spec: {
        name: spec.name,
        display: spec.display,
        size: spec.size,
        width_px: spec.width_px,
        height_px: spec.height_px,
      },
    });
  } catch (e) {
    const msg = (e as Error).message ?? "알 수 없는 오류";
    // API 키 관련 메시지는 사용자에게 그대로 노출하지 않도록 필터
    const safe = /API\s*키/.test(msg)
      ? "서버 설정 오류입니다. 관리자에게 문의해주세요."
      : msg;
    console.error("[idphoto] Gemini 처리 실패:", msg);
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
