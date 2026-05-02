// 행정구역 코드 → 사람이 읽을 수 있는 라벨 매핑
// 행안부 5자리 행정구역코드 기준 — 광역(시/도) 단위만 매핑
// 시군구 단위는 후속 단계에서 확장 예정 (현재는 코드 그대로 표시)

export const SIDO_NAMES: Record<string, string> = {
  "00000": "전국",
  "11000": "서울특별시",
  "26000": "부산광역시",
  "27000": "대구광역시",
  "28000": "인천광역시",
  "29000": "광주광역시",
  "30000": "대전광역시",
  "31000": "울산광역시",
  "36000": "세종특별자치시",
  "41000": "경기도",
  "42000": "강원특별자치도",
  "43000": "충청북도",
  "44000": "충청남도",
  "45000": "전라북도",
  "46000": "전라남도",
  "47000": "경상북도",
  "48000": "경상남도",
  "50000": "제주특별자치도",
};

// 시도 코드 목록 (필터 select 옵션용)
// "00000"(전국)은 필터에서는 보통 의미가 없으므로 제외하고 노출
export const SIDO_FILTER_OPTIONS: Array<{ code: string; label: string }> =
  Object.entries(SIDO_NAMES)
    .filter(([code]) => code !== "00000")
    .map(([code, label]) => ({ code, label }));

// 코드 → 라벨 변환
// - 정확히 매핑되면 라벨 반환
// - 5자리 코드인데 광역만 매칭 안되는 경우(시군구 코드 등): 앞 2자리로 시도 추정해 "OO 일부" 형식
// - 그 외: 코드 그대로 반환
export function regionLabel(code: string): string {
  if (!code) return "(미지정)";
  if (SIDO_NAMES[code]) return SIDO_NAMES[code];
  // 시군구 코드로 추정 — 앞 2자리 + "000"으로 시도 매칭
  if (code.length === 5) {
    const sidoCode = code.slice(0, 2) + "000";
    const sidoName = SIDO_NAMES[sidoCode];
    if (sidoName) return `${sidoName} (${code})`;
  }
  return code;
}

// regionCodes 배열을 사람이 읽을 수 있는 문자열로
// 전국이면 "전국" 한 줄, 아니면 라벨 콤마로
export function regionCodesLabel(codes: string[] | null | undefined): string {
  if (!codes || codes.length === 0) return "지역 정보 없음";
  if (codes.includes("00000")) return "전국";
  return codes.map(regionLabel).join(", ");
}
