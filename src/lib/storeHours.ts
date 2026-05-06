// 매장 영업시간 표시 유틸 — Store.hours 문자열을 사용자에게 보기 좋은 라벨로
//
// DB의 hours는 자유 형식 문자열 (예: "10:00~22:00", "24시간", "07:00~23:00", "월-금 09-21").
// 정확히 파싱이 안 될 수 있으므로 "지금 영업 중?"은 best-effort 휴리스틱.

export type StoreOpenStatus = {
  label: string;          // 사용자에게 표시할 텍스트 (예: "🟢 영업 중", "🔴 영업 종료")
  isOpen: boolean | null; // true=영업, false=종료, null=판단 불가 (정보 없음)
  rawHours: string | null;
};

// "10:00~22:00" / "10-22" / "10:00-22:00" 형태에서 (시작시각, 종료시각) 추출
function parseRange(s: string): [number, number] | null {
  // 시:분 형태 우선
  const hm = s.match(/(\d{1,2}):(\d{2})\s*[~-]\s*(\d{1,2}):(\d{2})/);
  if (hm) {
    const start = parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);
    const end = parseInt(hm[3], 10) * 60 + parseInt(hm[4], 10);
    return [start, end];
  }
  // 시 only
  const h = s.match(/(\d{1,2})\s*[~-]\s*(\d{1,2})/);
  if (h) {
    return [parseInt(h[1], 10) * 60, parseInt(h[2], 10) * 60];
  }
  return null;
}

export function evaluateOpenStatus(hours: string | null | undefined, now = new Date()): StoreOpenStatus {
  if (!hours || !hours.trim()) {
    return { label: "영업시간 정보 없음", isOpen: null, rawHours: null };
  }
  const raw = hours.trim();
  // "24시간" / "24h" — 항상 영업
  if (/24\s*시간|24h|24\/7/i.test(raw)) {
    return { label: "🟢 24시간 영업", isOpen: true, rawHours: raw };
  }
  const range = parseRange(raw);
  if (!range) {
    // 파싱 실패 — raw 그대로 표시 (사용자가 직접 판독)
    return { label: raw, isOpen: null, rawHours: raw };
  }
  const [startMin, endMin] = range;
  const cur = now.getHours() * 60 + now.getMinutes();
  let isOpen: boolean;
  if (endMin > startMin) {
    // 일반 케이스: 09:00~22:00
    isOpen = cur >= startMin && cur < endMin;
  } else {
    // 자정 넘김: 22:00~02:00
    isOpen = cur >= startMin || cur < endMin;
  }
  return {
    label: isOpen ? `🟢 영업 중 (${raw})` : `🔴 영업 종료 (${raw})`,
    isOpen,
    rawHours: raw,
  };
}
