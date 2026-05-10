// 관리자 레이아웃 — 게이팅 + 좌측 사이드 네비
// 비관리자는 notFound() (404) — 관리자 페이지의 존재 자체를 숨김
import Link from "next/link";
import { requireAdmin } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "대시보드", icon: "📊" },
  { href: "/admin/users", label: "사용자", icon: "👥" },
  { href: "/admin/receipts", label: "영수증", icon: "📸" },
  { href: "/admin/products", label: "상품", icon: "📦" },
  { href: "/admin/benefits", label: "정부혜택", icon: "🏛️" },
  { href: "/admin/sync", label: "동기화", icon: "🔄" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-screen bg-stone-50 -mx-4 -my-6">
      <div className="bg-stone-900 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>🛠️</span>
          <span className="font-bold">관리자</span>
          <span className="text-xs text-stone-400 ml-2">{admin.nickname}</span>
        </div>
        <Link href="/" className="text-xs text-stone-400 hover:text-white">
          ← 사이트로
        </Link>
      </div>

      <div className="grid md:grid-cols-[200px_1fr] gap-0">
        <nav
          aria-label="관리자 네비게이션"
          className="bg-white border-r border-line md:min-h-[calc(100vh-48px)] py-3"
        >
          <ul className="flex md:flex-col overflow-x-auto md:overflow-visible">
            {NAV.map((n) => (
              <li key={n.href} className="shrink-0">
                <Link
                  href={n.href}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-stone-50 whitespace-nowrap"
                >
                  <span aria-hidden>{n.icon}</span>
                  <span>{n.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
