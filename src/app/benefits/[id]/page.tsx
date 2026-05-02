import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { regionCodesLabel } from "@/lib/benefits/regions";
import { sourceLabel } from "@/lib/benefits/types";
import { categoryGroup } from "@/lib/benefits/categories";
import { stripHtml } from "@/lib/benefits/sanitize";

export const dynamic = "force-dynamic";

// eligibilityRules에서 사람이 읽을 자유텍스트 키들
// matcher가 해석하는 룰 외에 원본 안내문이 들어 있는 키들
const ELIGIBILITY_TEXT_KEYS: Array<{ key: string; label: string }> = [
  { key: "지원대상", label: "지원대상" },
  { key: "선정기준", label: "선정기준" },
  { key: "지원내용", label: "지원내용" },
  { key: "신청방법", label: "신청방법" },
];

async function getBenefitDetail(id: string) {
  const benefit = await prisma.benefit.findUnique({ where: { id } });
  if (!benefit) return null;
  return benefit;
}

// 현재 사용자의 BenefitMatch 조회 (있으면)
async function getMatchForCurrentUser(benefitId: string) {
  const authUser = await getCurrentUser();
  if (!authUser) return null;
  // Supabase auth user.id로 BenefitProfile 조회
  // (User 테이블 동기화는 다른 곳에서 처리되었다고 가정. 없으면 null)
  const profile = await prisma.benefitProfile.findUnique({
    where: { userId: authUser.id },
  });
  if (!profile) return null;
  const match = await prisma.benefitMatch.findUnique({
    where: {
      profileId_benefitId: { profileId: profile.id, benefitId },
    },
  });
  return match;
}

function formatDateOnly(d: Date | null | undefined): string {
  if (!d) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

// 마감까지 남은 일수 (소수 버림). 마감일 없으면 null
function daysUntil(end: Date | null | undefined): number | null {
  if (!end) return null;
  const ms = end.getTime() - Date.now();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export default async function BenefitDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const benefit = await getBenefitDetail(params.id);
  if (!benefit) return notFound();

  const match = await getMatchForCurrentUser(benefit.id);

  // 출처 라벨 + 카테고리 그룹 라벨 (단일 소스 함수 사용)
  const srcLabel = sourceLabel(benefit.sourceCode);
  const catLabel = benefit.category ? categoryGroup(benefit.category) : null;
  const remainDays = daysUntil(benefit.applyEndAt);
  const isClosingSoon = remainDays !== null && remainDays >= 0 && remainDays <= 30;
  const isClosed = remainDays !== null && remainDays < 0;

  // eligibilityRules에서 자유텍스트 키만 추출
  const rules = (benefit.eligibilityRules ?? {}) as Record<string, unknown>;
  const textBlocks = ELIGIBILITY_TEXT_KEYS.map((k) => {
    const v = rules[k.key];
    if (typeof v === "string" && v.trim().length > 0) {
      // HWP 에디터에서 export된 HTML 태그/엔티티 제거
      const cleaned = stripHtml(v);
      if (cleaned.length > 0) return { label: k.label, text: cleaned };
    }
    return null;
  }).filter((x): x is { label: string; text: string } => x !== null);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/benefits"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 정부 혜택 홈으로
        </Link>
      </div>

      {/* 헤더 카드 */}
      <header className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-medium bg-indigo-600 text-white px-2 py-0.5 rounded">
            {srcLabel}
          </span>
          {catLabel && (
            <span className="text-xs font-medium bg-white border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded">
              {catLabel}
            </span>
          )}
          {isClosed && (
            <span className="text-xs font-medium bg-stone-200 text-stone-600 px-2 py-0.5 rounded">
              마감
            </span>
          )}
          {isClosingSoon && !isClosed && (
            <span className="text-xs font-medium bg-rose-600 text-white px-2 py-0.5 rounded">
              마감 임박 D-{remainDays}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold text-stone-900">
          {stripHtml(benefit.title)}
        </h1>
        {benefit.summary && (
          <p className="text-stone-700 text-sm mt-2 leading-relaxed whitespace-pre-line">
            {stripHtml(benefit.summary)}
          </p>
        )}
        {benefit.agency && (
          <div className="text-xs text-stone-600 mt-3">
            <span className="text-stone-500">제공기관 </span>
            <span className="font-medium">{benefit.agency}</span>
          </div>
        )}

        {/* 외부 링크 */}
        {(benefit.applyUrl || benefit.detailUrl) && (
          <div className="flex flex-wrap gap-2 mt-5">
            {benefit.applyUrl && (
              <a
                href={benefit.applyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                신청하러 가기 ↗
              </a>
            )}
            {benefit.detailUrl && (
              <a
                href={benefit.detailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white hover:bg-stone-50 border border-stone-300 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium"
              >
                상세 페이지 ↗
              </a>
            )}
          </div>
        )}
      </header>

      {/* 매칭 정보 카드 (로그인 + 매칭 결과 있을 때만) */}
      {match && (
        <section
          className={`border rounded-xl p-5 ${
            match.status === "matched"
              ? "bg-emerald-50 border-emerald-200"
              : match.status === "uncertain"
              ? "bg-amber-50 border-amber-200"
              : "bg-stone-50 border-stone-200"
          }`}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs text-stone-500">내 매칭 결과</div>
              <div className="text-lg font-bold mt-1">
                {match.status === "matched"
                  ? "받을 수 있을 가능성이 높습니다"
                  : match.status === "uncertain"
                  ? "정보 보강 시 매칭 가능성이 있습니다"
                  : "현재 자격 조건과 맞지 않습니다"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-500">자격 충족도</div>
              <div className="text-2xl font-bold text-indigo-600">
                {match.score}
                <span className="text-sm text-stone-400">/100</span>
              </div>
            </div>
          </div>

          {match.missingFields.length > 0 && (
            <div className="mt-4 text-sm">
              <div className="text-xs text-stone-500 mb-1">
                정확도를 올리려면 추가 입력이 필요해요
              </div>
              <div className="flex flex-wrap gap-1.5">
                {match.missingFields.map((f) => (
                  <span
                    key={f}
                    className="text-xs bg-white border border-stone-300 text-stone-700 px-2 py-0.5 rounded"
                  >
                    {f}
                  </span>
                ))}
              </div>
              <div className="mt-3">
                <Link
                  href="/benefits/onboarding"
                  className="text-xs text-indigo-600 hover:underline font-medium"
                >
                  정보 추가 입력하러 가기 →
                </Link>
              </div>
            </div>
          )}

          {/* 액션 버튼 — 라우트 미구현. 자리표시. */}
          {/* TODO: POST /api/benefits/match/[id]/action 구현 후 form action 연결 */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              className="text-sm bg-white border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
              title="곧 활성화됩니다"
            >
              {match.userAction === "saved" ? "저장됨" : "이 혜택 저장하기"}
            </button>
            <button
              type="button"
              disabled
              className="text-sm bg-white border border-stone-300 text-stone-600 px-3 py-1.5 rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
              title="곧 활성화됩니다"
            >
              관심 없음
            </button>
          </div>
        </section>
      )}

      {/* 신청 기간 */}
      <section className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="text-sm font-bold text-stone-900 mb-3">신청 기간</h2>
        <div
          className={`flex items-center gap-3 ${
            isClosingSoon && !isClosed ? "text-rose-700" : "text-stone-700"
          }`}
        >
          <div className="text-base font-medium">
            {formatDateOnly(benefit.applyStartAt)}
            {" ~ "}
            {benefit.applyEndAt ? formatDateOnly(benefit.applyEndAt) : "상시"}
          </div>
          {remainDays !== null && !isClosed && (
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded ${
                isClosingSoon
                  ? "bg-rose-600 text-white"
                  : "bg-stone-100 text-stone-700"
              }`}
            >
              D-{remainDays}
            </span>
          )}
          {isClosed && (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-600">
              마감
            </span>
          )}
        </div>
      </section>

      {/* 자격 조건 / 안내문 */}
      {textBlocks.length > 0 && (
        <section className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-stone-900 mb-3">자격 조건 및 안내</h2>
          <dl className="space-y-4">
            {textBlocks.map((b) => (
              <div key={b.label}>
                <dt className="text-xs font-medium text-indigo-700 mb-1">
                  {b.label}
                </dt>
                <dd className="text-sm text-stone-700 whitespace-pre-line pl-3 border-l-2 border-indigo-100">
                  {b.text}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* 대상 지역 */}
      <section className="bg-white border border-stone-200 rounded-xl p-5">
        <h2 className="text-sm font-bold text-stone-900 mb-3">대상 지역</h2>
        <div className="text-sm text-stone-700">
          {regionCodesLabel(benefit.regionCodes)}
        </div>
      </section>

      {/* 메타 정보 */}
      <section className="text-xs text-stone-400 flex flex-wrap gap-x-4 gap-y-1">
        <span>출처 ID: {benefit.sourceId}</span>
        <span>최종 동기화: {formatDateOnly(benefit.lastSyncedAt)}</span>
      </section>
    </div>
  );
}
