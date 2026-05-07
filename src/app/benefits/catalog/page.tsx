import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { SIDO_FILTER_OPTIONS } from "@/lib/benefits/regions";
import {
  CATEGORY_GROUP_KEYS,
  originalsForGroup,
} from "@/lib/benefits/categories";
import BackButton from "@/components/benefits/BackButton";
import BenefitCard from "@/components/benefits/BenefitCard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const TARGET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "individual", label: "개인" },
  { value: "household", label: "가구" },
  { value: "business", label: "사업자" },
];

type SearchParams = {
  category?: string; // 그룹 키 ("일자리", "사업·창업" 등) — 빈값이면 전체
  region?: string; // 앞 2자리 시도 코드 ("11", "26" 등) — 빈값이면 전체
  endingSoon?: string; // "1"이면 30일 이내
  target?: string;
  q?: string;
  page?: string;
};

function parseSearchParams(sp: SearchParams) {
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  return {
    category: sp.category?.trim() || "", // 그룹 키
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

  // 카테고리는 그룹 키 — 그룹에 속하는 원본 카테고리들에 대해 in 검색
  if (f.category) {
    const originals = originalsForGroup(f.category);
    if (originals.length > 0) {
      where.category = { in: originals };
    } else {
      // 알 수 없는 그룹 키 — 매칭 0건 강제 (안전)
      where.category = { in: ["__no_match__"] };
    }
  }
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
        <BackButton fallbackHref="/benefits" fallbackLabel="정부 혜택 홈으로" />
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
        className="card p-4 space-y-3"
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
              {CATEGORY_GROUP_KEYS.map((g) => (
                <option key={g} value={g}>
                  {g}
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
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((b) => (
            <BenefitCard
              key={b.id}
              href={`/benefits/${b.id}`}
              title={b.title}
              summary={b.summary}
              agency={b.agency}
              category={b.category}
              sourceCode={b.sourceCode}
              applyEndAt={b.applyEndAt}
              variant="compact"
            />
          ))}
        </div>
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
