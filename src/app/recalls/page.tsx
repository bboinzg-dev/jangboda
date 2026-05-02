import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const revalidate = 300;

type RangeKey = "7d" | "1m" | "all";

const RANGE_LABEL: Record<RangeKey, string> = {
  "7d": "최근 7일",
  "1m": "1개월",
  all: "전체",
};

function rangeStart(range: RangeKey): Date | null {
  const now = Date.now();
  if (range === "7d") return new Date(now - 1000 * 60 * 60 * 24 * 7);
  if (range === "1m") return new Date(now - 1000 * 60 * 60 * 24 * 30);
  return null;
}

function gradeBadgeClass(grade?: string | null): string {
  if (!grade) return "bg-stone-100 text-stone-600";
  if (grade.includes("1")) return "bg-rose-100 text-rose-700";
  if (grade.includes("2")) return "bg-orange-100 text-orange-700";
  if (grade.includes("3")) return "bg-amber-100 text-amber-700";
  return "bg-stone-100 text-stone-600";
}

function formatDate(d: Date): string {
  // YYYY-MM-DD HH:mm (KST)
  const t = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(t.getUTCDate()).padStart(2, "0");
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mi = String(t.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export default async function RecallsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const rangeParam = (sp.range ?? "7d") as RangeKey;
  const range: RangeKey =
    rangeParam === "7d" || rangeParam === "1m" || rangeParam === "all"
      ? rangeParam
      : "7d";

  const start = rangeStart(range);
  const where: Prisma.RecallWhereInput = start
    ? { registeredAt: { gte: start } }
    : {};

  const recalls = await prisma.recall.findMany({
    where,
    orderBy: { registeredAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
          🚨 회수·판매중지 식품
        </h1>
        <p className="text-sm text-stone-600">
          식약처가 회수·판매중지 처분한 식품 목록입니다. 같은 제품을
          가지고 계시면 즉시 사용을 중지하세요.
        </p>
      </header>

      {/* 기간 필터 탭 */}
      <nav className="flex gap-2">
        {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => {
          const active = k === range;
          return (
            <Link
              key={k}
              href={`/recalls?range=${k}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                active
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-white text-stone-700 border-stone-200 hover:bg-stone-50"
              }`}
            >
              {RANGE_LABEL[k]}
            </Link>
          );
        })}
      </nav>

      {recalls.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="font-bold mb-1">해당 기간에 회수 정보가 없습니다</h2>
          <p className="text-sm text-stone-500">
            기간을 변경해서 다시 확인해보세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {recalls.map((r) => {
            const firstImg = r.imageUrls?.[0];
            return (
              <article
                key={r.id}
                className="bg-white border border-stone-200 rounded-xl p-4 flex gap-3"
              >
                {firstImg ? (
                  <div className="shrink-0 w-20 h-20 relative rounded-lg overflow-hidden bg-stone-100">
                    {/* 외부 도메인 — unoptimized로 안전하게 */}
                    <Image
                      src={firstImg}
                      alt={r.productName}
                      fill
                      sizes="80px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="shrink-0 w-20 h-20 rounded-lg bg-stone-100 flex items-center justify-center text-stone-400 text-2xl">
                    🚫
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2 flex-wrap">
                    <h3 className="font-bold text-stone-900 truncate">
                      {r.productName}
                    </h3>
                    {r.grade && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${gradeBadgeClass(
                          r.grade
                        )}`}
                      >
                        {r.grade}
                      </span>
                    )}
                  </div>
                  {r.manufacturer && (
                    <div className="text-xs text-stone-500 mt-0.5 truncate">
                      {r.manufacturer}
                    </div>
                  )}
                  <div className="text-xs text-rose-700 mt-1 line-clamp-2">
                    {r.reason}
                  </div>
                  <div className="text-[10px] text-stone-400 mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>등록: {formatDate(r.registeredAt)}</span>
                    {r.barcode && <span>바코드: {r.barcode}</span>}
                    {r.foodTypeName && <span>유형: {r.foodTypeName}</span>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <footer className="text-[11px] text-stone-400 pt-2">
        출처: 식품의약품안전처 식품안전나라 (회수·판매중지 정보 I0490). 최대
        200건 표시.
      </footer>
    </div>
  );
}
