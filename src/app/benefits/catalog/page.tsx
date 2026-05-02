import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { SIDO_FILTER_OPTIONS, regionCodesLabel } from "@/lib/benefits/regions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const SOURCE_LABELS: Record<string, string> = {
  GOV24: "정부24",
  MSS_BIZ: "중기부",
  MSS_SUPPORT: "중기부",
  BIZINFO: "기업마당",
  SEOUL: "서울",
  NTS: "국세청",
  MANUAL: "수동",
};

// 카테고리 필터 옵션 (시드/실데이터 기준 자주 등장하는 라벨)
const CATEGORY_OPTIONS = [
  "일자리",
  "교육",
  "주거",
  "건강",
  "돌봄",
  "문화",
  "사업자",
  "기타",
];

const TARGET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "individual", label: "개인" },
  { value: "household", label: "가구" },
  { value: "business", label: "사업자" },
];

type SearchParams = {
  category?: string;
  region?: string; // 앞 2자리 시도 코드 ("11", "26" 등) — 빈값이면 전체
  endingSoon?: string; // "1"이면 30일 이내
  target?: string;
  q?: string;
  page?: string;
};

function parseSearchParams(sp: SearchParams) {
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  return {
    category: sp.category?.trim() || "",
    region: sp.region?.trim() || "", // "11", "26" 등 앞 2자리. "" = 전체
    endingSoon: sp.endingSoon === "1",
    target: sp.target?.trim() || "",
    q: sp.q?.trim() || "",
    page,
  };
}

// 필터 → Prisma where
function buildWhere(f: ReturnType<typeof parseSearchParams>): Prisma.BenefitWhereInput {
  const where: Prisma.BenefitWhereInput = { active: true };

  if (f.category) where.category = f.category;
  if (f.target) where.targetType = f.target;

  if (f.q) {
    where.title = { contains: f.q, mode: "insensitive" };
  }

  // 지역 필터: 앞 2자리 시도 코드 또는 "00000"(전국)도 함께 매칭
  // 예: region="11"이면 ["00000", "11"로 시작하는 코드] 매치
  if (f.region) {
    where.OR = [
      { regionCodes: { has: "00000" } },
      { regionCodes: { hasSome: codesStartingWith(f.region) } },
    ];
  }

  // 마감 임박 (오늘 이후 30일 이내)
  if (f.endingSoon) {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    where.applyEndAt = { gte: now, lte: in30 };
  }

  return where;
}

// "11"이라는 앞자리로 시작하는 가능한 5자리 코드 후보
// regionCodes는 Postgres 배열 컬럼이라 startsWith 검색이 직접 안 되므로
// 가장 흔한 "XX000"(시도 자체)만 후보로 포함. 시군구 단위는 한계 인정.
function codesStartingWith(prefix: string): string[] {
  const codes: string[] = [`${prefix}000`];
  return codes;
}

async function getBenefits(f: ReturnType<typeof parseSearchParams>) {
  const where = buildWhere(f);
  const skip = (f.page - 1) * PAGE_SIZE;
  const [total, items] = await Promise.all([
    prisma.benefit.count({ where }),
    prisma.benefit.findMany({
      where,
      // 마감일 가까운 순. null은 뒤로.
      orderBy: [{ applyEndAt: { sort: "asc", nulls: "last" } }, { lastSyncedAt: "desc" }],
      skip,
      take: PAGE_SIZE,
    }),
  ]);
  return { total, items };
}

function formatDateOnly(d: Date | null | undefined): string {
  if (!d) return "상시";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function daysUntil(end: Date | null | undefined): number | null {
  if (!end) return null;
  return Math.floor((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

// 현재 필터 + override를 반영한 쿼리 문자열 생성 (페이지네이션용)
function buildQuery(
  f: ReturnType<typeof parseSearchParams>,
  override: Partial<{ page: number }>,
): string {
  const params = new URLSearchParams();
  if (f.category) params.set("category", f.category);
  if (f.region) params.set("region", f.region);
  if (f.endingSoon) params.set("endingSoon", "1");
  if (f.target) params.set("target", f.target);
  if (f.q) params.set("q", f.q);
  const page = override.page ?? f.page;
  if (page > 1) params.set("page", String(page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

export default async function BenefitsCatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const f = parseSearchParams(searchParams);
  const { total, items } = await getBenefits(f);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

      <header>
        <h1 className="text-2xl font-bold">전체 혜택 카탈로그</h1>
        <p className="text-sm text-stone-600 mt-1">
          정부24·중기부·기업마당 등에서 가져온 혜택을 한 번에 둘러보세요.
        </p>
      </header>

      {/* 필터 폼 — Form GET 방식 (클라 JS 없이 동작) */}
      <form
        method="get"
        className="bg-white border border-stone-200 rounded-xl p-4 space-y-3"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 검색어 */}
          <label className="block">
            <span className="text-xs text-stone-500 mb-1 block">검색어</span>
            <input
              type="text"
              name="q"
              defaultValue={f.q}
              placeholder="제목으로 검색"
              className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:border-indigo-400"
            />
          </label>

          {/* 카테고리 */}
          <label className="block">
            <span className="text-xs text-stone-500 mb-1 block">카테고리</span>
            <select
              name="category"
              defaultValue={f.category}
              className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm bg-white focus:outline-none focus:border-indigo-400"
            >
              <option value="">전체</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          {/* 지역 (시도) */}
          <label className="block">
            <span className="text-xs text-stone-500 mb-1 block">지역</span>
            <select
              name="region"
              defaultValue={f.region}
              className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm bg-white focus:outline-none focus:border-indigo-400"
            >
              <option value="">전체</option>
              {SIDO_FILTER_OPTIONS.map((s) => (
                <option key={s.code} value={s.code.slice(0, 2)}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          {/* 대상 */}
          <label className="block">
            <span className="text-xs text-stone-500 mb-1 block">대상</span>
            <select
              name="target"
              defaultValue={f.target}
              className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm bg-white focus:outline-none focus:border-indigo-400"
            >
              <option value="">전체</option>
              {TARGET_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              name="endingSoon"
              value="1"
              defaultChecked={f.endingSoon}
              className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
            />
            마감 30일 이내만 보기
          </label>

          <div className="flex gap-2">
            <Link
              href="/benefits/catalog"
              className="text-sm text-stone-600 hover:text-stone-900 px-3 py-1.5"
            >
              초기화
            </Link>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-1.5 rounded-md"
            >
              필터 적용
            </button>
          </div>
        </div>
      </form>

      {/* 결과 요약 */}
      <div className="text-sm text-stone-600">
        총 <strong className="text-stone-900">{total.toLocaleString()}</strong>건
        {totalPages > 1 && (
          <>
            {" · "}
            {f.page} / {totalPages} 페이지
          </>
        )}
      </div>

      {/* 카드 리스트 */}
      {items.length === 0 ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-10 text-center">
          <div className="text-stone-700 font-medium mb-1">
            조건에 맞는 혜택이 없습니다
          </div>
          <div className="text-sm text-stone-500">
            필터를 바꾸거나{" "}
            <Link href="/benefits/catalog" className="text-indigo-600 hover:underline">
              초기화
            </Link>
            해 보세요.
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((b) => {
            const remain = daysUntil(b.applyEndAt);
            const isClosingSoon = remain !== null && remain >= 0 && remain <= 30;
            const sourceLabel = SOURCE_LABELS[b.sourceCode] ?? b.sourceCode;
            return (
              <li
                key={b.id}
                className="card-clickable relative bg-white border border-stone-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-sm transition"
              >
                <Link
                  href={`/benefits/${b.id}`}
                  className="absolute inset-0"
                  aria-label={`${b.title} 상세 보기`}
                />
                <div className="flex flex-wrap items-center gap-1.5 mb-2 relative pointer-events-none">
                  <span className="text-[11px] font-medium bg-indigo-600 text-white px-1.5 py-0.5 rounded">
                    {sourceLabel}
                  </span>
                  {b.category && (
                    <span className="text-[11px] font-medium bg-indigo-50 border border-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded">
                      {b.category}
                    </span>
                  )}
                  {isClosingSoon && (
                    <span className="text-[11px] font-bold bg-rose-600 text-white px-1.5 py-0.5 rounded">
                      D-{remain}
                    </span>
                  )}
                </div>
                <div className="font-semibold text-stone-900 leading-snug pointer-events-none">
                  {b.title}
                </div>
                {b.summary && (
                  <div className="text-xs text-stone-600 mt-1 line-clamp-2 pointer-events-none">
                    {b.summary}
                  </div>
                )}
                <div className="text-xs text-stone-500 mt-3 flex flex-wrap gap-x-3 gap-y-1 pointer-events-none">
                  {b.agency && <span>{b.agency}</span>}
                  <span>마감 {formatDateOnly(b.applyEndAt)}</span>
                  <span>{regionCodesLabel(b.regionCodes)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between pt-2">
          {f.page > 1 ? (
            <Link
              href={`/benefits/catalog${buildQuery(f, { page: f.page - 1 })}`}
              className="text-sm bg-white border border-stone-300 hover:bg-stone-50 px-4 py-2 rounded-md"
            >
              ← 이전
            </Link>
          ) : (
            <span className="text-sm text-stone-300 border border-stone-200 px-4 py-2 rounded-md">
              ← 이전
            </span>
          )}
          <div className="text-xs text-stone-500">
            {f.page} / {totalPages}
          </div>
          {f.page < totalPages ? (
            <Link
              href={`/benefits/catalog${buildQuery(f, { page: f.page + 1 })}`}
              className="text-sm bg-white border border-stone-300 hover:bg-stone-50 px-4 py-2 rounded-md"
            >
              다음 →
            </Link>
          ) : (
            <span className="text-sm text-stone-300 border border-stone-200 px-4 py-2 rounded-md">
              다음 →
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
