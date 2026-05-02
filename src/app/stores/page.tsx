"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { StoreMarker } from "@/components/StoresMap";
import DirectionsButton from "@/components/DirectionsButton";
import {
  searchMartsNearby,
  searchConveniencesNearby,
  type DiscoveredStore,
} from "@/lib/kakaoLocal";

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
      <div className="h-[400px] bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 text-sm">
        지도 로딩 중...
      </div>
    ),
  }
);

// API 응답에 chainCategory가 추가되어 있어 확장 타입 사용
type StoreItem = StoreMarker & {
  chainCategory?: string;
};

type FilterCategory = "all" | "mart" | "convenience";

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

  async function load(lat?: number, lng?: number) {
    setLoading(true);
    const params = new URLSearchParams();
    if (lat && lng) {
      params.set("lat", String(lat));
      params.set("lng", String(lng));
      params.set("radius", "20");
    }
    const res = await fetch(`/api/stores?${params}`);
    const data = await res.json();
    setStores(data.stores);
    setLoading(false);
  }

  useEffect(() => {
    load();
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
      load(lat, lng);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
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

  // 카테고리 필터 적용
  const filtered = stores.filter((s) => {
    if (filter === "all") return true;
    return s.chainCategory === filter;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">주변 마트</h1>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSearchByLocation}
            className="text-sm bg-white border border-stone-300 px-3 py-1.5 rounded-md hover:bg-stone-50"
          >
            📍 내 위치로 검색
          </button>
          <button
            onClick={handleDiscoverNearby}
            disabled={discovering}
            className="text-sm bg-brand-600 text-white border border-brand-700 px-3 py-1.5 rounded-md hover:bg-brand-700 disabled:opacity-60"
          >
            {discovering ? "검색 중..." : "🔍 주변 마트/편의점 자동 추가"}
          </button>
        </div>
      </div>

      {loc && (
        <div className="text-xs text-stone-500">
          내 위치: {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
        </div>
      )}

      {discoverMsg && (
        <div className="text-sm bg-stone-50 border border-stone-200 rounded-md px-3 py-2 text-stone-700">
          {discoverMsg}
        </div>
      )}

      {/* 카테고리 필터 칩 */}
      <div className="flex gap-2">
        {(["all", "mart", "convenience"] as FilterCategory[]).map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`text-xs px-3 py-1 rounded-full border ${
              filter === c
                ? "bg-brand-600 text-white border-brand-700"
                : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
            }`}
          >
            {c === "all"
              ? "전체"
              : c === "mart"
              ? "🛒 마트"
              : "🏪 편의점"}
          </button>
        ))}
      </div>

      {/* 지도 */}
      <StoresMap stores={filtered} myLocation={loc} height="380px" />

      {/* 리스트 */}
      {loading ? (
        <div className="text-center py-8 text-stone-500">로딩 중...</div>
      ) : (
        <ul className="space-y-2">
          {filtered
            .filter((s) => s.lat !== 0 || s.lng !== 0)
            .map((s) => {
              const cat = s.chainCategory || "mart";
              const icon = CATEGORY_ICONS[cat] || "🛒";
              const label = CATEGORY_LABELS[cat] || "마트";
              return (
                <li
                  key={s.id}
                  className="bg-white border border-stone-200 rounded-lg p-4 flex justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-brand-600 font-medium flex items-center gap-1">
                      <span>{icon}</span>
                      <span>{label}</span>
                      <span className="text-stone-300">·</span>
                      <span>{s.chainName}</span>
                    </div>
                    <div className="font-semibold">{s.name}</div>
                    <div className="text-xs text-stone-500">{s.address}</div>
                  </div>
                  <div className="text-right ml-4 shrink-0 flex flex-col items-end gap-1">
                    {s.distanceKm !== null && s.distanceKm !== undefined && (
                      <div className="text-sm font-bold">
                        {s.distanceKm.toFixed(1)}km
                      </div>
                    )}
                    <div className="text-xs text-stone-500">
                      {s.priceCount}건 가격
                    </div>
                    {s.lat > 0 && s.lng > 0 && (
                      <DirectionsButton name={s.name} lat={s.lat} lng={s.lng} />
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
