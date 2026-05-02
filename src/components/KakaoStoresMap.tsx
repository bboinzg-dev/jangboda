"use client";

import { useEffect, useRef, useState } from "react";
import type { StoreMarker } from "./StoresMap";

// 카카오맵 한정 글로벌 타입 (런타임 SDK 로드 후 window.kakao로 접근)
declare global {
  interface Window {
    kakao: {
      maps: {
        load: (cb: () => void) => void;
        Map: new (
          container: HTMLElement,
          options: { center: unknown; level: number }
        ) => unknown;
        LatLng: new (lat: number, lng: number) => unknown;
        Marker: new (options: {
          position: unknown;
          map?: unknown;
          image?: unknown;
        }) => { setMap: (map: unknown) => void };
        InfoWindow: new (options: {
          content: string;
          removable?: boolean;
        }) => { open: (map: unknown, marker: unknown) => void; close: () => void };
        MarkerImage: new (
          src: string,
          size: unknown,
          options?: unknown
        ) => unknown;
        Size: new (w: number, h: number) => unknown;
      };
    };
  }
}

type Props = {
  stores: StoreMarker[];
  myLocation?: { lat: number; lng: number } | null;
  height?: string;
};

const SDK_SCRIPT_ID = "kakao-maps-sdk";

function loadKakaoSdk(appKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("server"));
    if (window.kakao?.maps) return resolve();
    const existing = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => window.kakao.maps.load(() => resolve()));
      return;
    }
    const s = document.createElement("script");
    s.id = SDK_SCRIPT_ID;
    s.async = true;
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve());
    s.onerror = () => reject(new Error("Kakao SDK 로드 실패"));
    document.head.appendChild(s);
  });
}

export default function KakaoStoresMap({ stores, myLocation, height = "400px" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
    if (!appKey) {
      setError("KAKAO 키 미설정");
      return;
    }
    if (!containerRef.current) return;

    let cancelled = false;
    loadKakaoSdk(appKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const offline = stores.filter((s) => s.lat !== 0 || s.lng !== 0);
        if (offline.length === 0) {
          setError("표시할 매장 없음");
          return;
        }
        const center = myLocation
          ? new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng)
          : new window.kakao.maps.LatLng(offline[0].lat, offline[0].lng);

        const map = new window.kakao.maps.Map(containerRef.current, {
          center,
          level: 7,
        });

        offline.forEach((s) => {
          const marker = new window.kakao.maps.Marker({
            position: new window.kakao.maps.LatLng(s.lat, s.lng),
            map,
          });
          const info = new window.kakao.maps.InfoWindow({
            content: `<div style="padding:6px 10px; font-size:12px; min-width:160px">
              <div style="color:#c2410c; font-weight:600">${s.chainName}</div>
              <div style="font-weight:600">${s.name}</div>
              <div style="color:#78716c; font-size:11px; margin-top:2px">${s.address}</div>
              ${
                s.distanceKm != null
                  ? `<div style="font-size:11px; margin-top:2px">${s.distanceKm.toFixed(1)}km</div>`
                  : ""
              }
            </div>`,
            removable: true,
          });
          (marker as unknown as { setMap: (m: unknown) => void; }).setMap = marker.setMap;
          // Marker 클릭 이벤트
          window.kakao.maps && (window.kakao.maps as unknown as Record<string, unknown>);
          // 카카오 SDK는 event.addListener 패턴
          // 단순화: 인포윈도우 자동 표시 대신 직접 attach
          (window as unknown as { kakao: { maps: { event: { addListener: (...args: unknown[]) => void } } } }).kakao.maps.event?.addListener?.(
            marker,
            "click",
            () => info.open(map, marker)
          );
        });

        if (myLocation) {
          new window.kakao.maps.Marker({
            position: new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng),
            map,
          });
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [stores, myLocation]);

  if (error) {
    return (
      <div
        style={{ height }}
        className="bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 text-sm"
      >
        {error === "KAKAO 키 미설정" ? "카카오맵 키 미설정 (OpenStreetMap 사용 중)" : `카카오맵 오류: ${error}`}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="rounded-lg overflow-hidden border border-stone-200"
    />
  );
}
