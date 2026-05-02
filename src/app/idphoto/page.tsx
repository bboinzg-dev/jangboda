import { cookies } from "next/headers";
import { IDPHOTO_COOKIE, isCookieValid } from "@/lib/idphoto/auth";
import { PHOTO_SPECS_PUBLIC, BACKGROUND_OPTIONS } from "@/lib/idphoto/specs";
import IdPhotoClient from "./_components/IdPhotoClient";

// 캐싱 금지 — 쿠키 상태에 따라 화면이 바뀜
export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI 증명사진 — 장보다",
  description: "Gemini로 증명사진을 한 번에 만들어드립니다.",
};

export default function IdPhotoPage() {
  const cookie = cookies().get(IDPHOTO_COOKIE.name)?.value;
  const unlocked = isCookieValid(cookie);

  return (
    <div className="space-y-6">
      <header className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-2xl p-6">
        <div className="text-[11px] font-medium text-amber-700 mb-1">
          부가기능 · 유료 API 사용
        </div>
        <h1 className="text-2xl font-bold text-stone-900 mb-1">
          AI 증명사진 만들기
        </h1>
        <p className="text-sm text-stone-600 leading-relaxed">
          여권사진, 주민등록증, 비자 등 10가지 규격을 자동으로 만들어드립니다.
          <br />
          한국 사진관 스타일의 자연스러운 보정이 적용됩니다.
        </p>
        <p className="text-xs text-amber-800 bg-white/70 border border-amber-200 rounded-lg px-3 py-2 mt-3 leading-relaxed">
          ✅ <b>입력 사진이 곧 결과 품질입니다</b> — 정면 응시·무표정·밝은 조명·단색 배경에서 찍은
          사진일수록 결과물이 자연스럽고 깔끔하게 나와요.
        </p>
      </header>

      <IdPhotoClient
        unlocked={unlocked}
        specs={PHOTO_SPECS_PUBLIC}
        backgroundOptions={BACKGROUND_OPTIONS}
      />
    </div>
  );
}
