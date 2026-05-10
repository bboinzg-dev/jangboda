// 관리자 - 사용자 목록 (간단한 페이지네이션, 포인트·기여 수 표시)
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const skip = (page - 1) * PAGE_SIZE;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        nickname: true,
        role: true,
        points: true,
        createdAt: true,
        _count: { select: { receipts: true, prices: true } },
      },
    }),
    prisma.user.count(),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-ink-1">사용자</h1>
        <span className="text-sm text-ink-3">총 {total.toLocaleString()}명</span>
      </div>

      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-xs text-ink-3">
            <tr>
              <th className="text-left px-3 py-2">닉네임</th>
              <th className="text-left px-3 py-2">권한</th>
              <th className="text-right px-3 py-2">포인트</th>
              <th className="text-right px-3 py-2">영수증</th>
              <th className="text-right px-3 py-2">가격등록</th>
              <th className="text-left px-3 py-2">가입</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-stone-50">
                <td className="px-3 py-2 font-medium text-ink-1">
                  {u.nickname}
                </td>
                <td className="px-3 py-2">
                  {u.role === "admin" ? (
                    <span className="inline-block text-[11px] px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-bold">
                      ADMIN
                    </span>
                  ) : (
                    <span className="text-xs text-ink-3">user</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {u.points.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {u._count.receipts}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {u._count.prices}
                </td>
                <td className="px-3 py-2 text-xs text-ink-3">
                  {u.createdAt.toLocaleDateString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-center gap-1 text-sm">
          {page > 1 && (
            <Link
              href={`/admin/users?page=${page - 1}`}
              className="px-3 py-1.5 border border-line rounded hover:bg-stone-50"
            >
              이전
            </Link>
          )}
          <span className="px-3 py-1.5 text-ink-3">
            {page} / {lastPage}
          </span>
          {page < lastPage && (
            <Link
              href={`/admin/users?page=${page + 1}`}
              className="px-3 py-1.5 border border-line rounded hover:bg-stone-50"
            >
              다음
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
