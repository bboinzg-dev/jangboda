"use client";

import { useEffect, useRef, useState } from "react";
import type { StoreMarker } from "./StoresMap";

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
        event: {
          addListener: (target: unknown, type: string, handler: () => void) => void;
        };
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
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&libraries=services&autoload=false`;
    s.onload = () => window.kakao.maps.load(() => resolve());
    s.onerror = () => reject(new Error("Kakao SDK 로드 실패"));
    document.head.appendChild(s);
  });
}

export default function KakaoStoresMap({ stores, myLocation, height = "400px" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [overlayMessage, setOverlayMessage] = useState<string | null>("지도 준비 중...");
  const [fatalError, setFatalError] = useState<string | null>(null);

  useEffect(() => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
    if (!appKey) {
      setFatalError("KAKAO 키 미설정");
      return;
    }
    if (!containerRef.current) return;

    const offline = stores.filter((s) => s.lat !== 0 || s.lng !== 0);
    if (offline.length === 0) {
      // 매장 데이터가 아직 안 들어왔거나 모두 가상매장(lat=0)인 경우
      setOverlayMessage("매장 정보 로딩 중...");
      return;
    }

    let cancelled = false;
    setOverlayMessage("지도 그리는 중...");

    loadKakaoSdk(appKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;

        // 컨테이너 비우기 (재실행 시 누적 방지)
        containerRef.current.innerHTML = "";

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
          window.kakao.maps.event.addListener(marker, "click", () => info.open(map, marker));
        });

        if (myLocation) {
          new window.kakao.maps.Marker({
            position: new window.kakao.maps.LatLng(myLocation.lat, myLocation.lng),
            map,
          });
        }

        setOverlayMessage(null); // 성공 → overlay 제거
      })
      .catch((e: unknown) => {
        setFatalError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [stores, myLocation]);

  if (fatalError) {
    return (
      <div
        style={{ height }}
        className="bg-stone-100 rounded-lg flex items-center justify-center text-stone-500 text-sm"
      >
        {fatalError === "KAKAO 키 미설정"
          ? "카카오맵 키 미설정 (OpenStreetMap 사용 중)"
          : `카카오맵 오류: ${fatalError}`}
      </div>
    );
  }

  return (
    <div className="relative" style={{ height }}>
      <div
        ref={containerRef}
        className="rounded-lg overflow-hidden border border-stone-200 h-full w-full"
      />
      {overlayMessage && (
        <div className="absolute inset-0 bg-stone-100/90 rounded-lg flex items-center justify-center text-stone-500 text-sm pointer-events-none">
          {overlayMessage}
        </div>
      )}
    </div>
  );
}
