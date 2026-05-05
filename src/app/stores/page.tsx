"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { StoreMarker } from "@/components/StoresMap";
import DirectionsButton from "@/components/DirectionsButton";
import {
  searchMartsNearby,
  searchConveniencesNearby,
  geocodeAddress,
  type DiscoveredStore,
} from "@/lib/kakaoLocal";
import FavoriteToggle from "@/components/FavoriteToggle";
import { useFavorites } from "@/components/FavoritesProvider";
import EmptyState from "@/components/EmptyState";
import CollapsibleList from "@/components/CollapsibleList";
import ChainLogo from "@/components/ChainLogo";
import { IconPin } from "@/components/icons";
import { haversineKm } from "@/lib/distance";

// 카카오맵 키가 있으면 카카오, 없으면 Leaflet (OpenStreetMap)으로 자동 전환
const HAS_KAKAO = !!process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;

const StoresMap = dynamic(
  () =>
    HAS_KAKAO
      ? import("@/components/KakaoStoresMap")
      : import("@/components/StoresMap"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] bg-surface-muted rounded-xl flex items-center justify-center text-ink-3 text-sm">
        지도 로딩 중...
      </div>
    ),
  }
);

// API 응답에 chainCategory가 추가되어 있어 확장 타입 사용
type StoreItem = StoreMarker & {
  chainCategory?: string;
};

type FilterCategory = "all" | "mart" | "convenience" | "favorite";

const CATEGORY_ICONS: Record<string, string> = {
  mart: "🛒",
  convenience: "🏪",
  online: "📦",
  public: "📊",
};

const CATEGORY_LABELS: Record<string, string> = {
  mart: "마트",
  convenience: "편의점",
  online: "온라인",
  public: "시세",
};

export default function StoresPage() {
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [discoverMsg, setDiscoverMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterCategory>("all");
  const [regionQuery, setRegionQuery] = useState("");
  const [regionLabel, setRegionLabel] = useState<string | null>(null);
  const { authed, ids: favoriteIds } = useFavorites();

  // discoverMsg 5초 자동 사라짐
  useEffect(() => {
    if (!discoverMsg) return;
    const t = setTimeout(() => setDiscoverMsg(null), 5000);
    return () => clearTimeout(t);
  }, [discoverMsg]);

  async function load(_lat?: number, _lng?: number) {
    setLoading(true);
    // /api/stores는 사용자 위치 무관 — 모두 동일 응답으로 CDN 캐시 적중률 ↑
    // 거리 계산은 클라이언트(useMemo) 측에서 위치 변경 시 즉시 처리
    const res = await fetch("/api/stores");
    const data = await res.json();
    setStores(data.stores);
    setLoading(false);
  }

  // 첫 진입 시 자동으로 내 위치 요청 (silent — 권한 요청만 할 뿐 강제 X)
  // 권한 거부 / 위치 실패 시 전체 보기로 폴백
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!navigator.geolocation) {
          await load();
          return;
        }
        const { lat, lng } = await new Promise<{ lat: number; lng: number }>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) =>
                resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              (err) => reject(err),
              { timeout: 6000, maximumAge: 5 * 60 * 1000 }
            );
          }
        );
        if (!mounted) return;
        setLoc({ lat, lng });
        setRegionLabel("📍 내 위치");
        await load(lat, lng);
      } catch {
        // 권한 거부 또는 timeout — 전체 보기 fallback
        if (mounted) await load();
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function getLocation(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("브라우저가 위치 기능을 지원하지 않습니다"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          resolve({ lat: latitude, lng: longitude });
        },
        (err) => reject(new Error("위치 가져오기 실패: " + err.message))
      );
    });
  }

  async function handleSearchByLocation() {
    try {
      const { lat, lng } = await getLocation();
      setLoc({ lat, lng });
      setRegionLabel("📍 내 위치");
      load(lat, lng);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSearchRegion() {
    if (!regionQuery.trim()) return;
    if (!HAS_KAKAO) {
      alert("카카오맵 키가 필요합니다");
      return;
    }
    setLoading(true);
    setDiscoverMsg("📍 지역 검색 중...");
    try {
      // 카카오 SDK services 로드 대기 — 지도가 마운트되면 로드됨
      if (
        typeof window !== "undefined" &&
        !(window.kakao?.maps as unknown as { services?: unknown })?.services
      ) {
        await new Promise((r) => setTimeout(r, 500));
      }
      const result = await geocodeAddress(regionQuery.trim());
      if (!result) {
        setDiscoverMsg(`❌ "${regionQuery}"에 해당하는 지역을 찾지 못했습니다`);
        setLoading(false);
        return;
      }
      setLoc({ lat: result.lat, lng: result.lng });
      setRegionLabel(
        `📍 ${result.placeName ?? result.roadAddress ?? result.address}`
      );
      setDiscoverMsg(null);
      await load(result.lat, result.lng);
    } catch (e) {
      setDiscoverMsg("❌ 지역 검색 실패: " + (e instanceof Error ? e.message : String(e)));
      setLoading(false);
    }
  }

  async function handleDiscoverNearby() {
    if (!HAS_KAKAO) {
      alert("카카오맵 키가 설정되지 않아 자동 발견을 사용할 수 없습니다");
      return;
    }
    setDiscovering(true);
    setDiscoverMsg("위치 확인 중...");
    try {
      const { lat, lng } = await getLocation();
      setLoc({ lat, lng });

      setDiscoverMsg("🔍 카카오 Local에서 주변 마트/편의점 검색 중...");
      // 카카오 SDK가 services 라이브러리와 함께 로드되어 있어야 함
      // 지도가 한 번 그려지면 SDK가 로드되므로, 한 번 load() 호출로 stores를 채우면서 SDK 로드 유도
      // 그래도 services 미로드인 경우 함수 내부에서 에러
      const radius = 5000; // 5km
      const [marts, convs] = await Promise.all([
        searchMartsNearby(lat, lng, radius).catch((e) => {
          console.warn("마트 검색 실패:", e);
          return [] as DiscoveredStore[];
        }),
        searchConveniencesNearby(lat, lng, radius).catch((e) => {
          console.warn("편의점 검색 실패:", e);
          return [] as DiscoveredStore[];
        }),
      ]);

      const all = [...marts, ...convs];
      if (all.length === 0) {
        setDiscoverMsg(
          "주변에서 매장을 찾지 못했습니다 (카카오 SDK services 미로드일 수 있습니다)"
        );
        setDiscovering(false);
        return;
      }

      setDiscoverMsg(
        `🔍 ${all.length}개 매장 찾음 (마트 ${marts.length}, 편의점 ${convs.length}) — 등록 중...`
      );

      const res = await fetch("/api/stores/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stores: all }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "등록 실패");
      }

      setDiscoverMsg(
        `✅ 마트 ${marts.length}, 편의점 ${convs.length} (신규 ${data.created}, 이미 있음 ${data.existing})`
      );

      // 매장 리스트 새로고침
      await load(lat, lng);
    } catch (e) {
      setDiscoverMsg(
        "❌ 오류: " + (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setDiscovering(false);
    }
  }

  // 카테고리 + 즐겨찾기 필터 적용 + 위치 있으면 거리 계산·정렬·20km 반경 필터 (클라이언트 측)
  // 서버 응답은 사용자 위치 무관(CDN 캐시 적중) → 클라이언트가 위치 변경 시 즉시 재계산
  const filtered = useMemo(() => {
    let list = stores.filter((s) => {
      if (filter === "favorite") return favoriteIds.has(s.id);
      if (filter === "all") return true;
      return s.chainCategory === filter;
    });
    if (loc && loc.lat != null && loc.lng != null) {
      list = list.map((s) => ({
        ...s,
        distanceKm:
          s.lat != null && s.lng != null
            ? haversineKm(loc.lat, loc.lng, s.lat, s.lng)
            : null,
      }));
      // 20km 반경 + 가까운 순
      list = list
        .filter((s) => (s.distanceKm ?? Infinity) <= 20)
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    }
    return list;
  }, [stores, filter, favoriteIds, loc]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-ink-1">주변 마트</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSearchByLocation}
            className="text-sm bg-brand-500 hover:bg-brand-600 text-white border border-brand-600 px-4 py-2 rounded-xl font-semibold inline-flex items-center gap-1.5"
          >
            <IconPin size={16} className="text-white" />
            내 위치 보기
          </button>
        </div>
      </div>

      {(loc || regionLabel) && (
        <div className="text-xs text-ink-3">
          {regionLabel ?? `${loc?.lat.toFixed(4)}, ${loc?.lng.toFixed(4)}`}
        </div>
      )}

      {discoverMsg && (
        <div className="text-sm bg-surface-muted border border-line rounded-xl px-3 py-2 text-ink-2">
          {discoverMsg}
        </div>
      )}

      {/* 카테고리 + 즐겨찾기 필터 칩 */}
      <div className="flex flex-wrap gap-2">
        {(["all", "mart", "convenience", "favorite"] as FilterCategory[])
          .filter((c) => c !== "favorite" || authed)
          .map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`text-xs px-3 py-1 rounded-full border ${
                filter === c
                  ? "bg-brand-600 text-white border-brand-700"
                  : "bg-white text-ink-2 border-line-strong hover:bg-surface-muted"
              }`}
            >
              {c === "all"
                ? "전체"
                : c === "mart"
                ? "🛒 마트"
                : c === "convenience"
                ? "🏪 편의점"
                : `★ 즐겨찾기 (${favoriteIds.size})`}
            </button>
          ))}
      </div>

      {/* 지도 */}
      <StoresMap stores={filtered} myLocation={loc} height="380px" />

      {/* 지역 검색 — 평소엔 접혀있고, 필요한 사람만 펼침 */}
      <details className="bg-white border border-line rounded-xl">
        <summary className="cursor-pointer px-4 py-2.5 text-sm text-ink-2 hover:bg-surface-muted select-none">
          🔎 다른 지역 검색하기
        </summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearchRegion();
          }}
          className="flex gap-2 px-4 pb-4 pt-1"
        >
          <input
            value={regionQuery}
            onChange={(e) => setRegionQuery(e.target.value)}
            placeholder="예: 강남역, 잠실, 서울 송파구"
            className="w-full h-11 px-4 rounded-xl bg-white border-line border text-sm focus:outline-none focus:border-brand-400"
            aria-label="지역 검색"
          />
          <button
            type="submit"
            className="bg-ink-1 hover:opacity-90 text-white px-4 h-11 rounded-xl text-sm font-medium"
          >
            검색
          </button>
        </form>
      </details>

      {/* 리스트 */}
      {loading ? (
        <div className="text-center py-8 text-ink-3">로딩 중...</div>
      ) : stores.length === 0 ? (
        // 매장 데이터 자체가 0건 — 첫 방문/자동 발견 미수행
        <EmptyState
          illustration="/illustrations/empty-stores.png"
          icon="📍"
          title="아직 등록된 매장이 없어요"
          description={
            <>
              내 위치를 잡고 <strong>주변 자동 추가</strong> 버튼을 누르면,
              <br />
              근처 마트와 편의점이 한 번에 등록됩니다.
            </>
          }
          actions={
            HAS_KAKAO
              ? [
                  // 자동 추가는 내부 함수라 액션 버튼 대신 안내 문구 + 별도 트리거
                ]
              : []
          }
        >
          <div className="flex flex-col sm:flex-row gap-2 justify-center mt-1">
            <button
              onClick={handleDiscoverNearby}
              disabled={discovering}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl font-medium text-sm shadow-sm"
            >
              🔍 주변 매장 자동 추가
            </button>
            <button
              onClick={handleSearchByLocation}
              className="bg-white hover:bg-surface-muted text-ink-2 border border-line-strong px-5 py-2.5 rounded-xl font-medium text-sm inline-flex items-center justify-center gap-1.5"
            >
              <IconPin size={16} className="text-ink-2" />
              내 위치로 검색
            </button>
          </div>
        </EmptyState>
      ) : filtered.length === 0 ? (
        // 데이터는 있는데 필터로 0건
        <EmptyState
          illustration="/illustrations/empty-stores.png"
          icon="🔍"
          title={
            filter === "favorite"
              ? "즐겨찾기한 매장이 없어요"
              : "이 카테고리에는 매장이 없어요"
          }
          description={
            filter === "favorite"
              ? "매장 카드의 ★를 눌러 즐겨찾기에 추가해보세요."
              : "다른 카테고리를 선택하거나 주변 자동 추가로 매장을 늘려보세요."
          }
          actions={[]}
        >
          <button
            onClick={() => setFilter("all")}
            className="text-xs text-brand-600 hover:underline"
          >
            ← 전체 보기
          </button>
        </EmptyState>
      ) : (
        (() => {
          // 매장 좌표 0/0 제외하고 정렬된 리스트만 표시
          const visibleStores = filtered.filter(
            (s) => s.lat !== 0 || s.lng !== 0
          );
          return (
            <div>
              <div className="text-xs text-ink-3 mb-2">
                총 {visibleStores.length}개 매장
              </div>
              <CollapsibleList
                as="ul"
                initialCount={10}
                innerClassName="space-y-2"
                expandLabel="매장 더 보기"
                collapseLabel="매장 접기"
              >
                {visibleStores.map((s) => {
                  const cat = s.chainCategory || "mart";
                  const icon = CATEGORY_ICONS[cat] || "🛒";
                  const label = CATEGORY_LABELS[cat] || "마트";
                  return (
                    <li
                      key={s.id}
                      className="card-clickable relative bg-white border border-line rounded-xl p-4 pr-8 flex justify-between hover:border-line-strong"
                    >
                      <Link
                        href={`/stores/${s.id}`}
                        className="absolute inset-0 z-0"
                        aria-label={`${s.name} 가격 보기`}
                      />
                      <div className="min-w-0 relative z-10 pointer-events-none flex-1 flex items-center gap-3">
                        <ChainLogo
                          src={s.chainLogoUrl}
                          name={s.chainName}
                          size={28}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-brand-600 font-medium flex items-center gap-1">
                            <span>{icon}</span>
                            <span>{label}</span>
                            <span className="text-ink-3">·</span>
                            <span>{s.chainName}</span>
                          </div>
                          <div className="font-semibold text-ink-1">{s.name}</div>
                          <div className="text-xs text-ink-3">{s.address}</div>
                        </div>
                      </div>
                      <div className="relative z-10 mr-2 self-center pointer-events-auto">
                        <FavoriteToggle storeId={s.id} stopPropagation />
                      </div>
                      <div className="text-right ml-4 shrink-0 flex flex-col items-end gap-1 relative z-10">
                        {s.distanceKm !== null && s.distanceKm !== undefined && (
                          <div className="text-sm font-bold tabular-nums pointer-events-none text-ink-1">
                            {s.distanceKm.toFixed(1)}km
                          </div>
                        )}
                        <div className="text-xs text-ink-3 pointer-events-none">
                          {s.priceCount && s.priceCount > 0 ? (
                            <>{s.priceCount}건 가격</>
                          ) : s.chainPriceCount && s.chainPriceCount > 0 ? (
                            <span className="text-ink-3">
                              같은 {s.chainName} {s.chainPriceCount}건
                            </span>
                          ) : (
                            <span className="text-ink-3">가격 정보 없음</span>
                          )}
                        </div>
                        {s.lat > 0 && s.lng > 0 && (
                          <DirectionsButton
                            name={s.name}
                            lat={s.lat}
                            lng={s.lng}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </CollapsibleList>
            </div>
          );
        })()
      )}
    </div>
  );
}
