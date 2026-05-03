import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { formatWon, formatRelativeDate } from "@/lib/format";
import SourceBadge from "@/components/SourceBadge";
import EmptyState from "@/components/EmptyState";

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
          <EmptyState
            icon="★"
            title="자주 가는 마트를 등록해보세요"
            description={
              <>
                주변 마트 페이지에서 ★를 누르면 이 곳에 모입니다.
                <br />
                장바구니/상품 상세에서 즐겨찾기 매장만 골라 비교할 수 있어요.
              </>
            }
            actions={[
              { href: "/stores", label: "📍 주변 마트 둘러보기", primary: true },
            ]}
          />
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
          <EmptyState
            icon="📸"
            title="아직 올린 영수증이 없어요"
            description={
              <>
                영수증 한 장이면 가격이 자동 등록되고, 가계부도 시작됩니다.
                <br />
                포인트도 적립돼요 (+2점/건).
              </>
            }
            actions={[
              { href: "/upload", label: "첫 영수증 올리기", primary: true },
            ]}
          />
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
          <EmptyState
            icon="💰"
            title="아직 등록한 가격이 없어요"
            description={
              <>
                상품 상세 페이지에서 직접 입력하거나, 영수증을 올리면 자동으로
                등록됩니다.
                <br />
                수동 등록 +5점 / 영수증 +2점이 적립돼요.
              </>
            }
            actions={[
              { href: "/upload", label: "📸 영수증 올리기", primary: true },
              { href: "/search", label: "상품 찾아 입력하기" },
            ]}
          />
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

      {/* 🛠 도구 — 모바일 사용자 접근성 (데스크톱 더보기 메뉴 대체) */}
      <section>
        <h2 className="font-bold mb-3">🛠 도구</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Link
            href="/budget"
            className="card-clickable bg-white border border-stone-200 rounded-lg p-4 flex flex-col gap-1 hover:border-brand-300"
          >
            <div className="text-sm font-semibold flex items-center justify-between gap-2">
              <span>📊 가계부</span>
              <span className="text-stone-400">›</span>
            </div>
            <small className="text-xs text-stone-500">
              월별/카테고리별 소비 통계
            </small>
          </Link>
          <Link
            href="/idphoto"
            className="card-clickable bg-white border border-stone-200 rounded-lg p-4 flex flex-col gap-1 hover:border-brand-300"
          >
            <div className="text-sm font-semibold flex items-center justify-between gap-2">
              <span>📷 AI 증명사진</span>
              <span className="text-stone-400">›</span>
            </div>
            <small className="text-xs text-stone-500">
              여권·주민증·비자 등 자동 보정
            </small>
          </Link>
          <Link
            href="/sync"
            className="card-clickable bg-white border border-stone-200 rounded-lg p-4 flex flex-col gap-1 hover:border-brand-300"
          >
            <div className="text-sm font-semibold flex items-center justify-between gap-2">
              <span>🔄 데이터 동기화</span>
              <span className="text-stone-400">›</span>
            </div>
            <small className="text-xs text-stone-500">
              최신 가격 정보 갱신
            </small>
          </Link>
        </div>
      </section>

      {/* 📋 부가 정보 — 회수·이력·건강기능식품·레시피 등 보조 자료 */}
      <section>
        <h2 className="font-bold mb-3">📋 부가 정보</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link
            href="/recalls"
            className="card-clickable bg-white border border-stone-200 rounded-lg p-4 flex flex-col gap-1 hover:border-brand-300"
          >
            <div className="text-sm font-semibold flex items-center justify-between gap-2">
              <span>⚠️ 회수·판매중지</span>
              <span className="text-stone-400">›</span>
            </div>
            <small className="text-xs text-stone-500">
              식약처 안전 경고 식품
            </small>
          </Link>
          <Link
            href="/agritrace"
            className="card-clickable bg-white border border-stone-200 rounded-lg p-4 flex flex-col gap-1 hover:border-brand-300"
          >
            <div className="text-sm font-semibold flex items-center justify-between gap-2">
              <span>🌾 농산물 이력</span>
              <span className="text-stone-400">›</span>
            </div>
            <small className="text-xs text-stone-500">
              생산·유통 단계 추적
            </small>
          </Link>
          <Link
            href="/health-functional"
            className="card-clickable bg-white border border-stone-200 rounded-lg p-4 flex flex-col gap-1 hover:border-brand-300"
          >
            <div className="text-sm font-semibold flex items-center justify-between gap-2">
              <span>💊 건강기능식품</span>
              <span className="text-stone-400">›</span>
            </div>
            <small className="text-xs text-stone-500">
              인증 제품 검색
            </small>
          </Link>
          <Link
            href="/recipes"
            className="card-clickable bg-white border border-stone-200 rounded-lg p-4 flex flex-col gap-1 hover:border-brand-300"
          >
            <div className="text-sm font-semibold flex items-center justify-between gap-2">
              <span>🍳 레시피</span>
              <span className="text-stone-400">›</span>
            </div>
            <small className="text-xs text-stone-500">
              재료 기반 추천 레시피
            </small>
          </Link>
        </div>
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
