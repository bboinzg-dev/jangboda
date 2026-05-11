// 관리자 - 영수증 목록 (이미지 썸네일, 상태별 필터, 매장/업로더 표시)
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
type StatusFilter = "all" | "pending" | "parsed" | "verified";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "pending", label: "대기" },
  { value: "parsed", label: "파싱완료" },
  { value: "verified", label: "검증완료" },
];

export default async function AdminReceiptsPage({
  searchParams,
}: {
  searchParams: { page?: string; status?: StatusFilter };
}) {
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const status = (searchParams.status ?? "all") as StatusFilter;
  const skip = (page - 1) * PAGE_SIZE;

  const where = status === "all" ? {} : { status };

  const [items, total] = await Promise.all([
    prisma.receipt.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        imageUrl: true,
        status: true,
        createdAt: true,
        store: { select: { name: true, chain: { select: { name: true } } } },
        uploader: { select: { id: true, nickname: true } },
        _count: { select: { prices: true } },
      },
    }),
    prisma.receipt.count({ where }),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-ink-1">영수증</h1>
        <span className="text-sm text-ink-3">총 {total.toLocaleString()}건</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((o) => {
          const active = status === o.value;
          return (
            <Link
              key={o.value}
              href={`/admin/receipts?status=${o.value}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                active
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-surface border-line text-ink-2 hover:bg-surface-muted"
              }`}
            >
              {o.label}
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((r) => (
          <div
            key={r.id}
            className="bg-surface border border-line rounded-xl overflow-hidden flex flex-col"
          >
            <div className="aspect-square bg-surface-muted relative overflow-hidden">
              {r.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={r.imageUrl}
                  alt="영수증 이미지"
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-300 text-2xl">
                  📄
                </div>
              )}
              <span
                className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded font-bold ${
                  r.status === "verified"
                    ? "bg-success-soft text-success-text"
                    : r.status === "parsed"
                    ? "bg-brand-soft text-brand-700"
                    : "bg-surface-sunken text-ink-2"
                }`}
              >
                {r.status}
              </span>
            </div>
            <div className="p-2.5 text-xs">
              <div className="font-medium text-ink-1 truncate">
                {r.store?.name ?? "(매장 미식별)"}
              </div>
              <div className="text-ink-3 mt-0.5">
                {r.uploader?.nickname ?? "(익명)"} · {r._count.prices}품목
              </div>
              <div className="text-ink-3 mt-0.5">
                {r.createdAt.toLocaleDateString("ko-KR", {
                  timeZone: "Asia/Seoul",
                  month: "numeric",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-1 text-sm">
          {page > 1 && (
            <Link
              href={`/admin/receipts?status=${status}&page=${page - 1}`}
              className="px-3 py-1.5 border border-line rounded hover:bg-surface-muted"
            >
              이전
            </Link>
          )}
          <span className="px-3 py-1.5 text-ink-3">
            {page} / {lastPage}
          </span>
          {page < lastPage && (
            <Link
              href={`/admin/receipts?status=${status}&page=${page + 1}`}
              className="px-3 py-1.5 border border-line rounded hover:bg-surface-muted"
            >
              다음
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
