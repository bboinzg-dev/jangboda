"use client";

import { useEffect } from "react";

// 사이트 진입(홈) 시 자주 이동하는 페이지의 데이터 API를 백그라운드로 미리 호출
// → 사용자가 /cart, /stores, /search 진입 시 CDN/브라우저 캐시 적중으로 즉시 응답
//
// fetch만 호출하고 결과는 버림 — 캐시만 채우는 목적.
// 첫 마운트 직후 한 번만 실행.
export default function PrefetchCommonAPIs() {
  useEffect(() => {
    // 1) 카탈로그 — /cart, /search에서 사용. slim 모드(가벼운 페이로드)
    fetch("/api/products?limit=1000&sort=popular&slim=true").catch(() => {});
    // 2) 매장 — /stores에서 사용. 사용자 위치 무관, 모두 동일 응답
    fetch("/api/stores").catch(() => {});
  }, []);
  return null;
}
