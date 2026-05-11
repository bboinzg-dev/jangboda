// 관리자 - 후원/협찬 슬롯 관리 (CRUD)
// MVP: 목록 + 토글 + 신규 등록 폼. 편집은 prisma studio 또는 후속.
import Link from "next/link";
import { prisma } from "@/lib/db";
import SponsorForm from "./_components/SponsorForm";
import SponsorToggle from "./_components/SponsorToggle";

export const dynamic = "force-dynamic";

const PLACEMENTS = [
  { key: "home_below_hero", label: "홈 — Hero 아래" },
  { key: "benefits_top", label: "혜택 페이지 상단" },
  { key: "budget_footer", label: "가계부 하단" },
];

export default async function AdminSponsorsPage() {
  const slots = await prisma.sponsorSlot.findMany({
    orderBy: [{ active: "desc" }, { weight: "desc" }, { createdAt: "desc" }],
  });

  const grouped = new Map<string, typeof slots>();
  for (const s of slots) {
    const list = grouped.get(s.placement) ?? [];
    list.push(s);
    grouped.set(s.placement, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink-1">협찬 슬롯</h1>
        <p className="text-sm text-ink-3 mt-1">
          홈/혜택/가계부 등에 노출되는 후원 카드를 직접 관리합니다.
          외부 링크 클릭은 자동 추적돼 어떤 placement가 잘 작동하는지 측정됩니다.
        </p>
      </div>

      <section className="bg-surface border border-line rounded-xl p-4">
        <h2 className="font-bold mb-3">새 슬롯 등록</h2>
        <SponsorForm placements={PLACEMENTS} />
      </section>

      <section className="space-y-4">
        <h2 className="font-bold">등록된 슬롯</h2>
        {slots.length === 0 ? (
          <div className="text-sm text-ink-3 text-center py-8 bg-surface border border-line rounded-xl">
            등록된 슬롯이 없습니다.
          </div>
        ) : (
          PLACEMENTS.map((p) => {
            const list = grouped.get(p.key) ?? [];
            if (list.length === 0) return null;
            return (
              <div
                key={p.key}
                className="bg-surface border border-line rounded-xl overflow-hidden"
              >
                <div className="bg-surface-muted px-4 py-2 text-xs font-medium text-ink-2 border-b border-line">
                  {p.label}{" "}
                  <span className="text-ink-3">({list.length}개)</span>
                </div>
                <ul className="divide-y divide-line">
                  {list.map((s) => (
                    <li
                      key={s.id}
                      className="p-3 flex items-start gap-3 text-sm"
                    >
                      {s.imageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={s.imageUrl}
                          alt=""
                          className="w-12 h-12 rounded object-cover bg-surface-muted shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-ink-1 truncate">
                          {s.title}
                        </div>
                        {s.body && (
                          <div className="text-xs text-ink-3 line-clamp-2">
                            {s.body}
                          </div>
                        )}
                        <div className="text-[11px] text-ink-3 mt-1 break-all">
                          → {s.href}
                        </div>
                        {s.notes && (
                          <div className="text-[11px] text-ink-2 mt-1 italic">
                            메모: {s.notes}
                          </div>
                        )}
                      </div>
                      <SponsorToggle id={s.id} active={s.active} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <div className="text-xs text-ink-3">
        ※ 데이터는 SponsorSlot 테이블에 저장됩니다. 편집이 필요하면 prisma studio
        (npm run db:studio)로 직접 수정하세요.
      </div>
    </div>
  );
}
