// 관리자 - 상품 카탈로그 (검색, 가격 등록 수, 이미지 유무)
import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string };
}) {
  const page = Math.max(1, Number(searchParams.page ?? "1"));
  const q = (searchParams.q ?? "").trim();
  const skip = (page - 1) * PAGE_SIZE;

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { brand: { contains: q, mode: "insensitive" as const } },
          { barcode: q },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: PAGE_SIZE,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        brand: true,
        category: true,
        unit: true,
        barcode: true,
        imageUrl: true,
        hasHaccp: true,
        _count: { select: { prices: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-extrabold text-ink-1">상품</h1>
        <span className="text-sm text-ink-3">총 {total.toLocaleString()}개</span>
      </div>

      <form method="get" action="/admin/products" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="상품명 / 브랜드 / 바코드"
          className="flex-1 px-3 py-2 border border-line rounded-lg text-sm"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium"
        >
          검색
        </button>
      </form>

      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-xs text-ink-3">
            <tr>
              <th className="text-left px-3 py-2 w-14">이미지</th>
              <th className="text-left px-3 py-2">상품명</th>
              <th className="text-left px-3 py-2">카테고리</th>
              <th className="text-left px-3 py-2">단위</th>
              <th className="text-right px-3 py-2">가격수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((p) => (
              <tr key={p.id} className="hover:bg-surface-muted">
                <td className="px-3 py-2">
                  <div className="w-10 h-10 bg-surface-muted rounded overflow-hidden flex items-center justify-center text-stone-300">
                    {p.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      "📦"
                    )}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/products/${p.id}`}
                    className="font-medium text-ink-1 hover:text-brand-600"
                    target="_blank"
                  >
                    {p.name}
                  </Link>
                  {p.brand && (
                    <div className="text-xs text-ink-3">{p.brand}</div>
                  )}
                  {p.hasHaccp && (
                    <span className="inline-block text-[10px] px-1.5 py-0.5 mt-1 rounded bg-success-soft text-success-text">
                      HACCP
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-ink-2">{p.category}</td>
                <td className="px-3 py-2 text-xs text-ink-2">{p.unit}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {p._count.prices}
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
              href={`/admin/products?q=${encodeURIComponent(q)}&page=${page - 1}`}
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
              href={`/admin/products?q=${encodeURIComponent(q)}&page=${page + 1}`}
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
