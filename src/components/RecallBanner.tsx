import Link from "next/link";
import { prisma } from "@/lib/db";

// 최근 7일 식약처 회수·판매중지 식품 배너 (서버 컴포넌트)
// 0건이면 아무것도 렌더하지 않음.
export default async function RecallBanner() {
  const sevenDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 7);
  const recalls = await prisma.recall.findMany({
    where: { registeredAt: { gte: sevenDaysAgo } },
    orderBy: { registeredAt: "desc" },
    take: 5,
  });

  if (recalls.length === 0) return null;

  // 등급 배지 색상
  const gradeBadgeClass = (grade?: string | null) => {
    if (!grade) return "bg-stone-100 text-stone-600";
    if (grade.includes("1")) return "bg-rose-100 text-rose-700";
    if (grade.includes("2")) return "bg-orange-100 text-orange-700";
    if (grade.includes("3")) return "bg-amber-100 text-amber-700";
    return "bg-stone-100 text-stone-600";
  };

  return (
    <section className="bg-rose-50 border border-rose-200 rounded-xl p-4 md:p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-base font-bold text-rose-900 flex items-center gap-2">
          🚨 최근 회수·판매중지 식품 {recalls.length}건
        </h2>
        <Link
          href="/recalls"
          className="text-xs text-rose-700 hover:text-rose-900 font-medium"
        >
          전체보기 ›
        </Link>
      </div>
      <ul className="space-y-2">
        {recalls.map((r) => (
          <li
            key={r.id}
            className="bg-white border border-rose-100 rounded-lg p-3 flex items-start gap-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-stone-900 truncate">
                  {r.productName}
                </span>
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
              <div className="text-xs text-rose-700 mt-0.5 line-clamp-1">
                {r.reason}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="text-[10px] text-stone-400 mt-3">
        출처: 식약처 식품안전나라 (회수·판매중지 정보, 최근 7일)
      </div>
    </section>
  );
}
