import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/supabase/server";
import { formatWon, formatRelativeDate } from "@/lib/format";
import SourceBadge from "@/components/SourceBadge";
import EmptyState from "@/components/EmptyState";
import ChainLogo from "@/components/ChainLogo";
import AuthButton from "@/components/AuthButton";
import {
  IconStore,
  IconPin,
  IconStar,
  IconUser,
  IconBell,
  IconArrowRight,
  IconCart,
  IconCamera,
} from "@/components/icons";

export const dynamic = "force-dynamic";

async function getProfileData(userId: string) {
  const [
    user,
    myPrices,
    myReceipts,
    topUsers,
    favorites,
    alertCount,
    profile,
  ] = await Promise.all([
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
        store: {
          include: { chain: true, _count: { select: { prices: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.priceAlert.count({ where: { userId, active: true } }),
    prisma.benefitProfile.findUnique({
      where: { userId },
      select: { regionCode: true },
    }),
  ]);

  // 도와준 이웃 수 — 내가 등록한 가격을 본 사용자(approximation):
  // 별도 조회수 테이블이 없으므로, 내 가격이 적용된 product를 즐겨찾기한 다른 사용자 수로 대체
  // 단순 계산 비용 회피를 위해 distinct contributorId 다른 사용자 수만 카운트
  const myProductIds = await prisma.price.findMany({
    where: { contributorId: userId },
    select: { productId: true },
    distinct: ["productId"],
  });
  const helpedNeighbors =
    myProductIds.length > 0
      ? await prisma.price.findMany({
          where: {
            productId: { in: myProductIds.map((p) => p.productId) },
            contributorId: { not: userId },
          },
          select: { contributorId: true },
          distinct: ["contributorId"],
        })
      : [];

  const myRank =
    (await prisma.user.count({
      where: { points: { gt: user?.points ?? 0 } },
    })) + 1;

  return {
    user,
    myPrices,
    myReceipts,
    topUsers,
    favorites,
    myRank,
    alertCount,
    regionCode: profile?.regionCode ?? null,
    helpedCount: helpedNeighbors.filter((n) => n.contributorId).length,
  };
}

// 행정구역코드(앞 2자리) → 시도 라벨
const SIDO_MAP: Record<string, string> = {
  "11": "서울특별시",
  "21": "부산광역시",
  "22": "대구광역시",
  "23": "인천광역시",
  "24": "광주광역시",
  "25": "대전광역시",
  "26": "울산광역시",
  "29": "세종특별자치시",
  "31": "경기도",
  "32": "강원특별자치도",
  "33": "충청북도",
  "34": "충청남도",
  "35": "전라북도",
  "36": "전라남도",
  "37": "경상북도",
  "38": "경상남도",
  "39": "제주특별자치도",
};

function regionLabel(code: string | null): string {
  if (!code) return "미설정";
  if (code === "00000") return "전국";
  const sido = SIDO_MAP[code.slice(0, 2)] ?? "기타";
  return code.endsWith("000") ? sido : `${sido} (${code})`;
}

export default async function ProfilePage() {
  const authUser = await getCurrentUser();
  if (!authUser) {
    redirect("/?auth_error=login_required");
  }

  const data = await getProfileData(authUser.id);
  const {
    user,
    myPrices,
    myReceipts,
    topUsers,
    favorites,
    myRank,
    alertCount,
    regionCode,
    helpedCount,
  } = data;

  const display =
    (authUser.user_metadata?.full_name as string | undefined) ??
    authUser.email?.split("@")[0] ??
    "사용자";

  const priceCount = user?._count.prices ?? 0;
  const points = user?.points ?? 0;

  return (
    <div className="space-y-6">
      {/* 1. 사용자 정보 헤더 — 인사 + 포인트/순위 + 활동 통계 한 카드로 통합 */}
      <header className="card p-5 md:p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-soft to-brand-soft flex items-center justify-center shrink-0 shadow-soft">
            <IconUser size={28} className="text-brand-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink-3">반갑습니다</div>
            <h1 className="text-xl md:text-2xl font-extrabold text-ink-1 truncate tracking-tight">
              {display}
            </h1>
            <div className="text-xs text-ink-3 truncate">{authUser.email}</div>
          </div>
          <div className="shrink-0">
            <AuthButton />
          </div>
        </div>

        {/* 4 통계 — 포인트·순위·등록·도움 한 줄 */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          <PointsCard points={points} />
          <div className="rounded-2xl border border-line/60 bg-surface-muted/40 p-3">
            <div className="text-xs text-ink-3">순위</div>
            <div className="text-xl md:text-2xl font-extrabold tabular-nums tracking-tight text-ink-1">
              #{myRank}
            </div>
          </div>
          <div className="rounded-2xl border border-line/60 bg-surface-muted/40 p-3">
            <div className="text-xs text-ink-3">올린 가격</div>
            <div className="text-xl md:text-2xl font-extrabold tabular-nums tracking-tight text-ink-1">
              {priceCount.toLocaleString()}
              <span className="text-sm font-semibold text-ink-3 ml-1">건</span>
            </div>
          </div>
          <div className="rounded-2xl border border-line/60 bg-surface-muted/40 p-3">
            <div className="text-xs text-ink-3">도와준 이웃</div>
            <div className="text-xl md:text-2xl font-extrabold tabular-nums tracking-tight text-ink-1">
              {helpedCount.toLocaleString()}
              <span className="text-sm font-semibold text-ink-3 ml-1">명</span>
            </div>
          </div>
        </div>
      </header>

      {/* 3. 즐겨찾기 매장 가로 스크롤 (NEW) */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-ink-1 inline-flex items-center gap-1.5">
            <IconStar size={18} className="text-ink-1" />
            즐겨찾기 매장
            <span className="text-ink-3 font-normal text-sm">
              ({favorites.length})
            </span>
          </h2>
          <Link
            href="/stores"
            className="text-xs text-brand-600 hover:underline inline-flex items-center gap-0.5"
          >
            전체 <IconArrowRight size={12} className="text-brand-600" />
          </Link>
        </div>
        {favorites.length === 0 ? (
          <div className="card p-5 text-center">
            <div className="text-sm text-ink-2 mb-2">
              아직 즐겨찾기가 없어요
            </div>
            <p className="text-xs text-ink-3 mb-3">
              주변 마트에서 ★를 눌러 자주 가는 매장을 등록하세요
            </p>
            <Link
              href="/stores"
              className="inline-flex items-center gap-1.5 text-xs bg-brand-500 hover:bg-brand-600 text-white px-3 py-2 rounded-xl font-medium shadow-soft hover:shadow-raise transition"
            >
              <IconPin size={14} className="text-white" />
              주변 마트 둘러보기
            </Link>
          </div>
        ) : (
          <div className="-mx-4 px-4 overflow-x-auto">
            <ul className="flex gap-3 pb-1">
              {favorites.map((f) => (
                <li
                  key={f.id}
                  className="shrink-0 w-40 card-hoverable p-3"
                >
                  <Link href={`/stores/${f.storeId}`} className="block">
                    <div className="flex items-center gap-2 mb-2">
                      <ChainLogo
                        src={f.store.chain.logoUrl}
                        name={f.store.chain.name}
                        size={24}
                      />
                      <div className="text-xs text-brand-600 font-medium truncate">
                        {f.store.chain.name}
                      </div>
                    </div>
                    <div className="font-semibold text-sm text-ink-1 truncate">
                      {f.store.name}
                    </div>
                    <div className="text-xs text-ink-3 truncate mt-0.5">
                      {f.store.address}
                    </div>
                    <div className="text-xs text-ink-3 mt-1 tabular-nums">
                      {f.store._count.prices}건 가격
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* 4. 가격 알림 활성화 (NEW) */}
      <section>
        <Link
          href="/search"
          className="card-clickable card p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-surface-muted flex items-center justify-center shrink-0">
            <IconBell size={20} className="text-ink-2" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-ink-1">가격 알림</div>
            <div className="text-xs text-ink-3">
              {alertCount > 0
                ? `활성 알림 ${alertCount}개 — 임계가 이하 발견 시 푸시`
                : "관심 상품을 임계가 아래로 떨어지면 알려드려요"}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1 text-xs text-ink-3">
            {alertCount > 0 ? "관리" : "설정"}
            <IconArrowRight size={14} className="text-ink-3" />
          </div>
        </Link>
      </section>

      {/* 5. 내 동네 설정 (NEW) */}
      <section>
        <Link
          href="/benefits/onboarding"
          className="card-clickable card p-4 flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-full bg-surface-muted flex items-center justify-center shrink-0">
            <IconPin size={20} className="text-ink-2" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-ink-1">내 동네</div>
            <div className="text-xs text-ink-3">
              {regionCode
                ? `${regionLabel(regionCode)} — 지역 혜택 추천에 사용`
                : "시/구를 등록하면 지역 혜택을 받아볼 수 있어요"}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-1 text-xs text-ink-3">
            {regionCode ? "변경" : "설정"}
            <IconArrowRight size={14} className="text-ink-3" />
          </div>
        </Link>
      </section>

      {/* 즐겨찾기 매장 풀 리스트 — 필요한 사용자만 펼침 */}
      {favorites.length > 0 && (
        <section>
          <h2 className="section-title mb-3 inline-flex items-center gap-1.5">
            <IconStore size={18} className="text-ink-1" />
            즐겨찾기 전체
          </h2>
          <ul className="space-y-2">
            {favorites.map((f) => (
              <li
                key={f.id}
                className="card-hoverable p-3 flex justify-between items-center text-sm"
              >
                <Link
                  href={`/stores/${f.storeId}`}
                  className="min-w-0 hover:underline"
                >
                  <div className="text-xs text-brand-600 font-medium">
                    {f.store.chain.name}
                  </div>
                  <div className="font-medium text-ink-1 truncate">
                    {f.store.name}
                  </div>
                  <div className="text-xs text-ink-3 truncate">
                    {f.store.address}
                  </div>
                </Link>
                <div className="text-right shrink-0 ml-3 text-xs text-ink-3 tabular-nums">
                  {f.store._count.prices}건
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 영수증 */}
      <section>
        <h2 className="section-title mb-3 inline-flex items-center gap-1.5">
          <IconCamera size={18} className="text-ink-1" />내 영수증 (
          {myReceipts.length}건)
        </h2>
        {myReceipts.length === 0 ? (
          <EmptyState
            illustration="/illustrations/receipt-illustration.png"
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
                typeof r.imageUrl === "string" &&
                /^https?:\/\//.test(r.imageUrl);
              return (
                <li
                  key={r.id}
                  className="card-hoverable p-3 flex justify-between items-center text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {showThumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.imageUrl}
                        alt="영수증"
                        className="w-12 h-12 object-cover rounded border border-line shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-ink-1 truncate">
                        {r.store?.name ?? "(매장 미지정)"}
                      </div>
                      <div className="text-xs text-ink-3">
                        {r.store?.chain.name} · {r._count.prices}건 등록
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3 text-xs text-ink-3">
                    {formatRelativeDate(r.createdAt)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 내가 등록한 가격 */}
      <section>
        <h2 className="section-title mb-3 inline-flex items-center gap-1.5">
          <IconCart size={18} className="text-ink-1" />
          내가 등록한 가격 ({myPrices.length}건)
        </h2>
        {myPrices.length === 0 ? (
          <EmptyState
            illustration="/illustrations/empty-cart.png"
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
          <ul className="space-y-2">
            {myPrices.map((p) => (
              <li
                key={p.id}
                className="card p-3 flex justify-between items-center gap-3 text-sm hover:border-line-strong"
              >
                <div className="min-w-0 flex-1">
                  {/* 긴 상품명 2줄까지 노출 */}
                  <div className="font-medium text-ink-1 leading-snug line-clamp-2">
                    {p.product.name}
                  </div>
                  <div className="text-xs text-ink-3 truncate mt-0.5">
                    {p.store.chain.name} · {p.store.name}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold tabular-nums text-ink-1">
                    {formatWon(p.listPrice ?? 0)}
                  </div>
                  <div className="flex gap-1 justify-end mt-0.5">
                    <SourceBadge source={p.source} />
                    <span className="text-[10px] text-ink-3">
                      {formatRelativeDate(p.createdAt)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 포인트 랭킹 */}
      <section>
        <h2 className="section-title mb-3">포인트 랭킹 (Top 10)</h2>
        <ul className="card overflow-hidden">
          {topUsers.map((u, i) => (
            <li
              key={u.id}
              className={`flex justify-between p-3 text-sm border-b last:border-b-0 border-line ${
                u.id === authUser.id ? "bg-brand-soft/50" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-ink-3 font-mono text-xs w-6 text-right tabular-nums">
                  {i + 1}
                </span>
                <span className="font-medium text-ink-1">{u.nickname}</span>
                {u.id === authUser.id && (
                  <span className="text-xs text-brand-600">(나)</span>
                )}
              </div>
              <div className="text-ink-2 tabular-nums">
                {u.points.toLocaleString()}점
              </div>
            </li>
          ))}
          {topUsers.length === 0 && (
            <li className="p-4 text-center text-ink-3 text-sm">
              아직 랭킹 데이터가 없습니다
            </li>
          )}
        </ul>
      </section>

      {/* 관리자 진입 — role=admin인 사용자에게만 노출 */}
      {user?.role === "admin" && (
        <section>
          <Link
            href="/admin"
            className="card-clickable card p-4 flex items-center gap-3 border-stone-900/20"
          >
            <div className="w-10 h-10 rounded-full bg-stone-900 text-white flex items-center justify-center shrink-0">
              🛠️
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink-1">관리자 페이지</div>
              <div className="text-xs text-ink-3">
                대시보드 · 사용자 · 영수증 · 데이터 동기화
              </div>
            </div>
            <IconArrowRight size={14} className="text-ink-3 shrink-0" />
          </Link>
        </section>
      )}

      {/* 도구 섹션 — 모바일 사용자 접근성 */}
      <section>
        <h2 className="section-title mb-3">도구</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Link
            href="/benefits"
            className="card-clickable bg-gradient-to-br from-info-soft to-surface border border-info/20 rounded-2xl p-4 flex flex-col gap-1 shadow-soft hover:shadow-raise hover:border-info/40 transition"
          >
            <div className="text-sm font-bold text-info-text flex items-center justify-between gap-2">
              <span>🎁 정부 혜택</span>
              <span className="text-info">›</span>
            </div>
            <small className="text-xs text-info-text/80">
              내가 받을 수 있는 지원금 매칭
            </small>
          </Link>
          <Link
            href="/benefits/saved"
            className="card-clickable card p-4 flex flex-col gap-1"
          >
            <div className="text-sm font-semibold text-ink-1 flex items-center justify-between gap-2">
              <span>★ 저장한 혜택</span>
              <span className="text-ink-3">›</span>
            </div>
            <small className="text-xs text-ink-3">
              나중에 신청할 혜택 모음
            </small>
          </Link>
          <Link
            href="/budget"
            className="card-clickable card p-4 flex flex-col gap-1"
          >
            <div className="text-sm font-semibold text-ink-1 flex items-center justify-between gap-2">
              <span>📊 가계부</span>
              <span className="text-ink-3">›</span>
            </div>
            <small className="text-xs text-ink-3">
              월별/카테고리별 소비 통계
            </small>
          </Link>
          <Link
            href="/idphoto"
            className="card-clickable card p-4 flex flex-col gap-1"
          >
            <div className="text-sm font-semibold text-ink-1 flex items-center justify-between gap-2">
              <span>📷 AI 증명사진</span>
              <span className="text-ink-3">›</span>
            </div>
            <small className="text-xs text-ink-3">
              여권·주민증·비자 등 자동 보정
            </small>
          </Link>
          <Link
            href="/sync"
            className="card-clickable card p-4 flex flex-col gap-1"
          >
            <div className="text-sm font-semibold text-ink-1 flex items-center justify-between gap-2">
              <span>🔄 데이터 동기화</span>
              <span className="text-ink-3">›</span>
            </div>
            <small className="text-xs text-ink-3">최신 가격 정보 갱신</small>
          </Link>
        </div>
      </section>

      {/* 계정 관리 — 회원 탈퇴 (PIPA §39의6 의무) */}
      <section>
        <h2 className="section-title mb-3">계정</h2>
        <div className="grid grid-cols-1 gap-2">
          <Link
            href="/legal/privacy"
            className="card-clickable card p-4 flex items-center justify-between text-sm"
          >
            <span className="text-ink-2">개인정보 처리방침</span>
            <IconArrowRight size={14} className="text-ink-3" />
          </Link>
          <Link
            href="/profile/delete"
            className="card-clickable card p-4 flex items-center justify-between text-sm border-danger/20 hover:border-danger/40"
          >
            <span className="text-danger-text">회원 탈퇴</span>
            <IconArrowRight size={14} className="text-danger-text" />
          </Link>
        </div>
      </section>

      {/* 부가 정보 */}
      <section>
        <h2 className="section-title mb-3">부가 정보</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Link
            href="/recalls"
            className="card-clickable card p-4 flex flex-col gap-1"
          >
            <div className="text-sm font-semibold text-ink-1 flex items-center justify-between gap-2">
              <span>⚠️ 회수·판매중지</span>
              <span className="text-ink-3">›</span>
            </div>
            <small className="text-xs text-ink-3">식약처 안전 경고 식품</small>
          </Link>
          <Link
            href="/agritrace"
            className="card-clickable card p-4 flex flex-col gap-1"
          >
            <div className="text-sm font-semibold text-ink-1 flex items-center justify-between gap-2">
              <span>🌾 농산물 이력</span>
              <span className="text-ink-3">›</span>
            </div>
            <small className="text-xs text-ink-3">생산·유통 단계 추적</small>
          </Link>
          <Link
            href="/health-functional"
            className="card-clickable card p-4 flex flex-col gap-1"
          >
            <div className="text-sm font-semibold text-ink-1 flex items-center justify-between gap-2">
              <span>💊 건강기능식품</span>
              <span className="text-ink-3">›</span>
            </div>
            <small className="text-xs text-ink-3">인증 제품 검색</small>
          </Link>
          <Link
            href="/recipes"
            className="card-clickable card p-4 flex flex-col gap-1"
          >
            <div className="text-sm font-semibold text-ink-1 flex items-center justify-between gap-2">
              <span>🍳 레시피</span>
              <span className="text-ink-3">›</span>
            </div>
            <small className="text-xs text-ink-3">재료 기반 추천 레시피</small>
          </Link>
          <Link
            href="/parsa"
            className="card-clickable card p-4 flex flex-col gap-1"
          >
            <div className="text-sm font-semibold text-ink-1 flex items-center justify-between gap-2">
              <span>📊 공공 가격</span>
              <span className="text-ink-3">›</span>
            </div>
            <small className="text-xs text-ink-3">한국소비자원 참가격 조사</small>
          </Link>
        </div>
      </section>
    </div>
  );
}

// 포인트 카드 — 다음 마일스톤(10/50/100/500/1000)까지의 진행바 표시
// 한국 4060의 즉각 보상 심리 자극 + 다음 행동 유도
function PointsCard({ points }: { points: number }) {
  const MILESTONES = [10, 50, 100, 500, 1000];
  const next = MILESTONES.find((m) => m > points) ?? null;
  const prev = [...MILESTONES].reverse().find((m) => m <= points) ?? 0;
  const progressPct = next
    ? Math.max(2, Math.round(((points - prev) / (next - prev)) * 100))
    : 100;

  return (
    <Link
      href="/rewards"
      className="block rounded-2xl border border-line/60 bg-surface-muted/40 p-3 hover:border-line-strong hover:bg-brand-soft/30 transition"
      aria-label="포인트 혜택 정책 보기"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-ink-3">포인트</div>
        <div className="text-[10px] text-brand-600 font-medium">혜택 보기 →</div>
      </div>
      <div className="text-xl md:text-2xl font-extrabold tabular-nums tracking-tight text-brand-600">
        {points.toLocaleString()}
      </div>
      {next ? (
        <>
          <div className="mt-1.5 w-full bg-surface-muted rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-brand-400 to-brand-600 h-1.5 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="text-[10px] text-ink-3 mt-1 tabular-nums">
            다음 {next}점까지 {next - points}점
          </div>
        </>
      ) : (
        <div className="text-[10px] text-success-text font-medium mt-1.5">
          🏆 마스터 등급
        </div>
      )}
    </Link>
  );
}
