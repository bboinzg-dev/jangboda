// 후원/협찬 슬롯 — 운영자가 SponsorSlot 테이블에 등록한 카드를 placement 키로 노출
// 등록된 슬롯이 없으면 아무것도 안 보임 (자리 차지 X). placeholder 모드로 운영자에게만 안내 가능.
//
// 사용:
//   <AdSlot placement="home_below_hero" />
//   <AdSlot placement="benefits_top" />
//
// 운영:
//   /admin/sponsors (TODO 별도 페이지) 또는 prisma studio로 SponsorSlot 직접 등록
//   - placement: 위 코드와 약속한 키
//   - active=true, startsAt/endsAt 또는 무기한
//   - href: 외부 출구 (TrackedLink가 자동 적용됨)
import { prisma } from "@/lib/db";
import TrackedLink from "@/components/TrackedLink";

type Props = {
  placement: string;
  /** 한 placement에 여러 슬롯이 있을 때 최대 표시 개수 (기본 1) */
  limit?: number;
};

async function getSlots(placement: string, limit: number) {
  const now = new Date();
  return prisma.sponsorSlot.findMany({
    where: {
      placement,
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });
}

export default async function AdSlot({ placement, limit = 1 }: Props) {
  const slots = await getSlots(placement, limit);
  if (slots.length === 0) return null;

  return (
    <section aria-label="협찬" className="space-y-2">
      {slots.map((s) => (
        <div
          key={s.id}
          className="bg-surface border border-line rounded-2xl p-3 flex items-center gap-3"
        >
          {s.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={s.imageUrl}
              alt=""
              loading="lazy"
              className="w-14 h-14 rounded-xl object-cover bg-surface-muted shrink-0"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] text-ink-3 mb-0.5">
              <span className="bg-surface-muted px-1.5 py-0.5 rounded">협찬</span>
            </div>
            <div className="font-semibold text-sm text-ink-1 truncate">
              {s.title}
            </div>
            {s.body && (
              <div className="text-xs text-ink-3 line-clamp-2 mt-0.5">
                {s.body}
              </div>
            )}
          </div>
          <TrackedLink
            href={s.href}
            kind="other"
            id={s.id}
            className="shrink-0 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold px-3 py-2 rounded-lg"
          >
            {s.ctaLabel}
          </TrackedLink>
        </div>
      ))}
    </section>
  );
}
