import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { formatWon, formatRelativeDate } from "@/lib/format";
import SourceBadge from "@/components/SourceBadge";

export const dynamic = "force-dynamic";

async function getProfileData(userId: string) {
  const [user, myPrices, myReceipts, topUsers, favorites] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: { select: { prices: true, receipts: true } },
      },
    }),
    prisma.price.findMany({
      where: { contributorId: userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        product: { select: { name: true } },
        store: { select: { name: true, chain: { select: { name: true } } } },
      },
    }),
    prisma.receipt.findMany({
      where: { uploaderId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        store: { select: { name: true, chain: { select: { name: true } } } },
        _count: { select: { prices: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { points: "desc" },
      take: 10,
      select: { id: true, nickname: true, points: true },
    }),
    prisma.favoriteStore.findMany({
      where: { userId },
      include: {
        store: { include: { chain: true, _count: { select: { prices: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const myRank =
    (await prisma.user.count({
      where: { points: { gt: user?.points ?? 0 } },
    })) + 1;

  return { user, myPrices, myReceipts, topUsers, favorites, myRank };
}

export default async function ProfilePage() {
  const authUser = await getCurrentUser();
  if (!authUser) {
    redirect("/?auth_error=login_required");
  }

  const data = await getProfileData(authUser.id);
  const { user, myPrices, myReceipts, topUsers, favorites, myRank } = data;

  const display =
    (authUser.user_metadata?.full_name as string | undefined) ??
    authUser.email?.split("@")[0] ??
    "사용자";

  return (
    <div className="space-y-6">
      <header className="bg-gradient-to-br from-brand-50 to-orange-50 rounded-xl p-6 border border-brand-100">
        <div className="text-xs text-stone-500">로그인 사용자</div>
        <h1 className="text-2xl font-bold mt-1">{display}</h1>
        <div className="text-xs text-stone-500 mt-1">{authUser.email}</div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="포인트" value={user?.points?.toLocaleString() ?? "0"} highlight />
          <Stat label="등록 가격" value={(user?._count.prices ?? 0).toLocaleString()} />
          <Stat label="순위" value={`#${myRank}`} />
        </div>
      </header>

      <section>
        <h2 className="font-bold mb-3">★ 즐겨찾기 매장 ({favorites.length}개)</h2>
        {favorites.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-6 text-center text-sm text-stone-500">
            자주 가는 매장을 ★로 등록하면 장바구니/상세에서 그 매장만 비교할 수 있어요.
            <br />
            <Link href="/stores" className="text-brand-600 hover:underline mt-1 inline-block">
              매장 둘러보기 →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {favorites.map((f) => (
              <li
                key={f.id}
                className="bg-white border border-stone-200 rounded-lg p-3 flex justify-between items-center text-sm"
              >
                <Link href={`/stores/${f.storeId}`} className="min-w-0 hover:underline">
                  <div className="text-xs text-brand-600 font-medium">
                    {f.store.chain.name}
                  </div>
                  <div className="font-medium truncate">{f.store.name}</div>
                  <div className="text-xs text-stone-500 truncate">
                    {f.store.address}
                  </div>
                </Link>
                <div className="text-right shrink-0 ml-3 text-xs text-stone-500">
                  {f.store._count.prices}건
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-3">📸 내 영수증 ({myReceipts.length}건)</h2>
        {myReceipts.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-6 text-center text-sm text-stone-500">
            아직 올린 영수증이 없습니다.
            <br />
            <Link href="/upload" className="text-brand-600 hover:underline">
              첫 영수증 올리기 →
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {myReceipts.map((r) => {
              // imageUrl이 http(s)로 시작하면 Storage URL → thumbnail 표시
              const showThumb =
                typeof r.imageUrl === "string" && /^https?:\/\//.test(r.imageUrl);
              return (
                <li
                  key={r.id}
                  className="bg-white border border-stone-200 rounded-lg p-3 flex justify-between items-center text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {showThumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.imageUrl}
                        alt="영수증"
                        className="w-12 h-12 object-cover rounded border border-stone-200 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {r.store?.name ?? "(매장 미지정)"}
                      </div>
                      <div className="text-xs text-stone-500">
                        {r.store?.chain.name} · {r._count.prices}건 등록
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3 text-xs text-stone-500">
                    {formatRelativeDate(r.createdAt)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-3">💰 내가 등록한 가격 ({myPrices.length}건)</h2>
        {myPrices.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-6 text-center text-sm text-stone-500">
            아직 등록한 가격이 없습니다.
          </div>
        ) : (
          <ul className="space-y-1">
            {myPrices.map((p) => (
              <li
                key={p.id}
                className="bg-white border border-stone-200 rounded-lg p-3 flex justify-between items-center text-sm"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.product.name}</div>
                  <div className="text-xs text-stone-500 truncate">
                    {p.store.chain.name} · {p.store.name}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="font-semibold">{formatWon(p.price)}</div>
                  <div className="flex gap-1 justify-end mt-0.5">
                    <SourceBadge source={p.source} />
                    <span className="text-[10px] text-stone-500">
                      {formatRelativeDate(p.createdAt)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-bold mb-3">🏆 포인트 랭킹 (Top 10)</h2>
        <ul className="bg-white border border-stone-200 rounded-lg overflow-hidden">
          {topUsers.map((u, i) => (
            <li
              key={u.id}
              className={`flex justify-between p-3 text-sm border-b last:border-b-0 border-stone-100 ${
                u.id === authUser.id ? "bg-brand-50/50" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-stone-400 font-mono text-xs w-6 text-right">
                  {i + 1}
                </span>
                <span className="font-medium">{u.nickname}</span>
                {u.id === authUser.id && (
                  <span className="text-xs text-brand-600">(나)</span>
                )}
              </div>
              <div className="text-stone-600">{u.points.toLocaleString()}점</div>
            </li>
          ))}
          {topUsers.length === 0 && (
            <li className="p-4 text-center text-stone-500 text-sm">
              아직 랭킹 데이터가 없습니다
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 text-center ${
        highlight ? "bg-white border border-brand-200" : "bg-white/60"
      }`}
    >
      <div className="text-xs text-stone-500">{label}</div>
      <div
        className={`text-lg font-bold ${
          highlight ? "text-brand-600" : "text-stone-700"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
