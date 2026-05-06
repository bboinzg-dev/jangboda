"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import Link from "next/link";

// Leaflet 기본 marker icon이 webpack에서 깨지는 이슈 — 직접 SVG icon
const orangeIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="
    background: #f97316;
    width: 28px;
    height: 28px;
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
  ">
    <span style="transform: rotate(45deg); font-size: 14px;">🛒</span>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

const blueIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="
    background: #3b82f6;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export type StoreMarker = {
  id: string;
  name: string;
  chainId?: string;
  chainName: string;
  chainLogoUrl?: string | null;
  address: string;
  lat: number;
  lng: number;
  hours?: string | null;     // 영업시간 — DB store.hours 또는 체인 default
  hoursSource?: "store" | "chain" | "unknown"; // 출처 — "체인 평균" 라벨용
  hoursNote?: string;        // 추가 안내 (예: "일부 지점 영업시간 다름")
  distanceKm?: number | null;
  priceCount?: number;
  chainPriceCount?: number; // 같은 chain의 다른 매장까지 합한 가격 수
};

type Props = {
  stores: StoreMarker[];
  myLocation?: { lat: number; lng: number } | null;
  height?: string;
};

// 사용자가 위치 변경하면 지도 자동 이동
function RecenterMap({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

export default function StoresMap({ stores, myLocation, height = "400px" }: Props) {
  // 매장이 없으면 빈 상태
  const offline = stores.filter((s) => s.lat !== 0 || s.lng !== 0);
  if (offline.length === 0) {
    return (
      <div
        style={{ height }}
        className="bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 text-sm"
      >
        지도에 표시할 매장이 없습니다
      </div>
    );
  }

  // 중심점: 내 위치 우선, 없으면 첫 매장
  const center: [number, number] = myLocation
    ? [myLocation.lat, myLocation.lng]
    : [offline[0].lat, offline[0].lng];

  return (
    <div style={{ height }} className="rounded-lg overflow-hidden border border-border">
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <RecenterMap center={center} />
        <TileLayer
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {myLocation && (
          <Marker position={[myLocation.lat, myLocation.lng]} icon={blueIcon}>
            <Popup>내 위치</Popup>
          </Marker>
        )}
        {offline.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={orangeIcon}>
            <Popup>
              <div className="text-sm">
                <div className="font-semibold text-brand-700">{s.chainName}</div>
                <div>{s.name}</div>
                <div className="text-xs text-stone-500 mt-1">{s.address}</div>
                {s.distanceKm !== null && s.distanceKm !== undefined && (
                  <div className="text-xs mt-1">
                    내 위치에서 <strong>{s.distanceKm.toFixed(1)}km</strong>
                  </div>
                )}
                {typeof s.priceCount === "number" && (
                  <div className="text-xs text-stone-500">
                    {s.priceCount}건 가격 등록
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
