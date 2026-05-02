"use client";

import { useEffect, useState } from "react";

type Store = {
  id: string;
  name: string;
  chainName: string;
  address: string;
  hours: string | null;
  priceCount: number;
  distanceKm: number | null;
};

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);

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

  function getLocation() {
    if (!navigator.geolocation) return alert("브라우저가 위치 기능을 지원하지 않습니다");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setLoc({ lat: latitude, lng: longitude });
        load(latitude, longitude);
      },
      (err) => alert("위치 가져오기 실패: " + err.message)
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">주변 마트</h1>
        <button
          onClick={getLocation}
          className="text-sm bg-white border border-stone-300 px-3 py-1.5 rounded-md hover:bg-stone-50"
        >
          📍 내 위치로 검색
        </button>
      </div>

      {loc && (
        <div className="text-xs text-stone-500">
          내 위치: {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-stone-500">로딩 중...</div>
      ) : (
        <ul className="space-y-2">
          {stores.map((s) => (
            <li
              key={s.id}
              className="bg-white border border-stone-200 rounded-lg p-4 flex justify-between"
            >
              <div className="min-w-0">
                <div className="text-xs text-brand-600 font-medium">
                  {s.chainName}
                </div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs text-stone-500">{s.address}</div>
                <div className="text-xs text-stone-500 mt-1">
                  영업시간: {s.hours ?? "정보 없음"}
                </div>
              </div>
              <div className="text-right ml-4 shrink-0">
                {s.distanceKm !== null && (
                  <div className="text-sm font-bold">
                    {s.distanceKm.toFixed(1)}km
                  </div>
                )}
                <div className="text-xs text-stone-500">
                  {s.priceCount}건 가격
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
