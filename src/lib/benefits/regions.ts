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

// 시도 코드(2자리, 예: "11") → 시군구 배열
// 행정안전부 행정표준코드 기준 (5자리 시군구 코드)
// "XX000" 형태(시도 단위 미상)는 sigunguOf 결과에 포함하지 않음 — UI에서 미선택 시 자동 처리
export const SIGUNGU: Record<string, { code: string; name: string }[]> = {
  // 11 서울특별시 (25)
  "11": [
    { code: "11110", name: "종로구" },
    { code: "11140", name: "중구" },
    { code: "11170", name: "용산구" },
    { code: "11200", name: "성동구" },
    { code: "11215", name: "광진구" },
    { code: "11230", name: "동대문구" },
    { code: "11260", name: "중랑구" },
    { code: "11290", name: "성북구" },
    { code: "11305", name: "강북구" },
    { code: "11320", name: "도봉구" },
    { code: "11350", name: "노원구" },
    { code: "11380", name: "은평구" },
    { code: "11410", name: "서대문구" },
    { code: "11440", name: "마포구" },
    { code: "11470", name: "양천구" },
    { code: "11500", name: "강서구" },
    { code: "11530", name: "구로구" },
    { code: "11545", name: "금천구" },
    { code: "11560", name: "영등포구" },
    { code: "11590", name: "동작구" },
    { code: "11620", name: "관악구" },
    { code: "11650", name: "서초구" },
    { code: "11680", name: "강남구" },
    { code: "11710", name: "송파구" },
    { code: "11740", name: "강동구" },
  ],
  // 26 부산광역시 (16)
  "26": [
    { code: "26110", name: "중구" },
    { code: "26140", name: "서구" },
    { code: "26170", name: "동구" },
    { code: "26200", name: "영도구" },
    { code: "26230", name: "부산진구" },
    { code: "26260", name: "동래구" },
    { code: "26290", name: "남구" },
    { code: "26320", name: "북구" },
    { code: "26350", name: "해운대구" },
    { code: "26380", name: "사하구" },
    { code: "26410", name: "금정구" },
    { code: "26440", name: "강서구" },
    { code: "26470", name: "연제구" },
    { code: "26500", name: "수영구" },
    { code: "26530", name: "사상구" },
    { code: "26710", name: "기장군" },
  ],
  // 27 대구광역시 (9)
  "27": [
    { code: "27110", name: "중구" },
    { code: "27140", name: "동구" },
    { code: "27170", name: "서구" },
    { code: "27200", name: "남구" },
    { code: "27230", name: "북구" },
    { code: "27260", name: "수성구" },
    { code: "27290", name: "달서구" },
    { code: "27710", name: "달성군" },
    { code: "27720", name: "군위군" },
  ],
  // 28 인천광역시 (10)
  "28": [
    { code: "28110", name: "중구" },
    { code: "28140", name: "동구" },
    { code: "28177", name: "미추홀구" },
    { code: "28185", name: "연수구" },
    { code: "28200", name: "남동구" },
    { code: "28237", name: "부평구" },
    { code: "28245", name: "계양구" },
    { code: "28260", name: "서구" },
    { code: "28710", name: "강화군" },
    { code: "28720", name: "옹진군" },
  ],
  // 29 광주광역시 (5)
  "29": [
    { code: "29110", name: "동구" },
    { code: "29140", name: "서구" },
    { code: "29155", name: "남구" },
    { code: "29170", name: "북구" },
    { code: "29200", name: "광산구" },
  ],
  // 30 대전광역시 (5)
  "30": [
    { code: "30110", name: "동구" },
    { code: "30140", name: "중구" },
    { code: "30170", name: "서구" },
    { code: "30200", name: "유성구" },
    { code: "30230", name: "대덕구" },
  ],
  // 31 울산광역시 (5)
  "31": [
    { code: "31110", name: "중구" },
    { code: "31140", name: "남구" },
    { code: "31170", name: "동구" },
    { code: "31200", name: "북구" },
    { code: "31710", name: "울주군" },
  ],
  // 36 세종특별자치시 (1)
  "36": [
    { code: "36110", name: "세종시" },
  ],
  // 41 경기도 (31)
  "41": [
    { code: "41110", name: "수원시" },
    { code: "41130", name: "성남시" },
    { code: "41150", name: "의정부시" },
    { code: "41170", name: "안양시" },
    { code: "41190", name: "부천시" },
    { code: "41210", name: "광명시" },
    { code: "41220", name: "평택시" },
    { code: "41250", name: "동두천시" },
    { code: "41270", name: "안산시" },
    { code: "41280", name: "고양시" },
    { code: "41290", name: "과천시" },
    { code: "41310", name: "구리시" },
    { code: "41360", name: "남양주시" },
    { code: "41370", name: "오산시" },
    { code: "41390", name: "시흥시" },
    { code: "41410", name: "군포시" },
    { code: "41430", name: "의왕시" },
    { code: "41450", name: "하남시" },
    { code: "41460", name: "용인시" },
    { code: "41480", name: "파주시" },
    { code: "41500", name: "이천시" },
    { code: "41550", name: "안성시" },
    { code: "41570", name: "김포시" },
    { code: "41590", name: "화성시" },
    { code: "41610", name: "광주시" },
    { code: "41630", name: "양주시" },
    { code: "41650", name: "포천시" },
    { code: "41670", name: "여주시" },
    { code: "41800", name: "연천군" },
    { code: "41820", name: "가평군" },
    { code: "41830", name: "양평군" },
  ],
  // 42 강원특별자치도 (18)
  "42": [
    { code: "42110", name: "춘천시" },
    { code: "42130", name: "원주시" },
    { code: "42150", name: "강릉시" },
    { code: "42170", name: "동해시" },
    { code: "42190", name: "태백시" },
    { code: "42210", name: "속초시" },
    { code: "42230", name: "삼척시" },
    { code: "42720", name: "홍천군" },
    { code: "42730", name: "횡성군" },
    { code: "42750", name: "영월군" },
    { code: "42760", name: "평창군" },
    { code: "42770", name: "정선군" },
    { code: "42780", name: "철원군" },
    { code: "42790", name: "화천군" },
    { code: "42800", name: "양구군" },
    { code: "42810", name: "인제군" },
    { code: "42820", name: "고성군" },
    { code: "42830", name: "양양군" },
  ],
  // 43 충청북도 (11)
  "43": [
    { code: "43110", name: "청주시" },
    { code: "43130", name: "충주시" },
    { code: "43150", name: "제천시" },
    { code: "43720", name: "보은군" },
    { code: "43730", name: "옥천군" },
    { code: "43740", name: "영동군" },
    { code: "43745", name: "증평군" },
    { code: "43750", name: "진천군" },
    { code: "43760", name: "괴산군" },
    { code: "43770", name: "음성군" },
    { code: "43800", name: "단양군" },
  ],
  // 44 충청남도 (15)
  "44": [
    { code: "44130", name: "천안시" },
    { code: "44150", name: "공주시" },
    { code: "44180", name: "보령시" },
    { code: "44200", name: "아산시" },
    { code: "44210", name: "서산시" },
    { code: "44230", name: "논산시" },
    { code: "44250", name: "계룡시" },
    { code: "44270", name: "당진시" },
    { code: "44710", name: "금산군" },
    { code: "44760", name: "부여군" },
    { code: "44770", name: "서천군" },
    { code: "44790", name: "청양군" },
    { code: "44800", name: "홍성군" },
    { code: "44810", name: "예산군" },
    { code: "44825", name: "태안군" },
  ],
  // 45 전라북도 (14)
  "45": [
    { code: "45110", name: "전주시" },
    { code: "45130", name: "군산시" },
    { code: "45140", name: "익산시" },
    { code: "45180", name: "정읍시" },
    { code: "45190", name: "남원시" },
    { code: "45210", name: "김제시" },
    { code: "45710", name: "완주군" },
    { code: "45720", name: "진안군" },
    { code: "45730", name: "무주군" },
    { code: "45740", name: "장수군" },
    { code: "45750", name: "임실군" },
    { code: "45770", name: "순창군" },
    { code: "45790", name: "고창군" },
    { code: "45800", name: "부안군" },
  ],
  // 46 전라남도 (22)
  "46": [
    { code: "46110", name: "목포시" },
    { code: "46130", name: "여수시" },
    { code: "46150", name: "순천시" },
    { code: "46170", name: "나주시" },
    { code: "46230", name: "광양시" },
    { code: "46710", name: "담양군" },
    { code: "46720", name: "곡성군" },
    { code: "46730", name: "구례군" },
    { code: "46770", name: "고흥군" },
    { code: "46780", name: "보성군" },
    { code: "46790", name: "화순군" },
    { code: "46800", name: "장흥군" },
    { code: "46810", name: "강진군" },
    { code: "46820", name: "해남군" },
    { code: "46830", name: "영암군" },
    { code: "46840", name: "무안군" },
    { code: "46860", name: "함평군" },
    { code: "46870", name: "영광군" },
    { code: "46880", name: "장성군" },
    { code: "46890", name: "완도군" },
    { code: "46900", name: "진도군" },
    { code: "46910", name: "신안군" },
  ],
  // 47 경상북도 (22)
  "47": [
    { code: "47110", name: "포항시" },
    { code: "47130", name: "경주시" },
    { code: "47150", name: "김천시" },
    { code: "47170", name: "안동시" },
    { code: "47190", name: "구미시" },
    { code: "47210", name: "영주시" },
    { code: "47230", name: "영천시" },
    { code: "47250", name: "상주시" },
    { code: "47280", name: "문경시" },
    { code: "47290", name: "경산시" },
    { code: "47730", name: "의성군" },
    { code: "47750", name: "청송군" },
    { code: "47760", name: "영양군" },
    { code: "47770", name: "영덕군" },
    { code: "47820", name: "청도군" },
    { code: "47830", name: "고령군" },
    { code: "47840", name: "성주군" },
    { code: "47850", name: "칠곡군" },
    { code: "47900", name: "예천군" },
    { code: "47920", name: "봉화군" },
    { code: "47930", name: "울진군" },
    { code: "47940", name: "울릉군" },
  ],
  // 48 경상남도 (18)
  "48": [
    { code: "48120", name: "창원시" },
    { code: "48170", name: "진주시" },
    { code: "48220", name: "통영시" },
    { code: "48240", name: "사천시" },
    { code: "48250", name: "김해시" },
    { code: "48270", name: "밀양시" },
    { code: "48310", name: "거제시" },
    { code: "48330", name: "양산시" },
    { code: "48720", name: "의령군" },
    { code: "48730", name: "함안군" },
    { code: "48740", name: "창녕군" },
    { code: "48820", name: "고성군" },
    { code: "48840", name: "남해군" },
    { code: "48850", name: "하동군" },
    { code: "48860", name: "산청군" },
    { code: "48870", name: "함양군" },
    { code: "48880", name: "거창군" },
    { code: "48890", name: "합천군" },
  ],
  // 50 제주특별자치도 (2)
  "50": [
    { code: "50110", name: "제주시" },
    { code: "50130", name: "서귀포시" },
  ],
};

// 시도 코드("11" 또는 "11000")로 시군구 배열 반환
export function sigunguOf(
  sidoCode: string,
): { code: string; name: string }[] {
  if (!sidoCode) return [];
  // "11000" 형태로 들어와도 앞 2자리만 사용
  const key = sidoCode.length >= 2 ? sidoCode.slice(0, 2) : sidoCode;
  return SIGUNGU[key] ?? [];
}

// 5자리 시군구 코드 → 시군구명
// 매칭되는 시군구가 없으면 null
export function sigunguName(code: string): string | null {
  if (!code || code.length !== 5) return null;
  const key = code.slice(0, 2);
  const list = SIGUNGU[key];
  if (!list) return null;
  const found = list.find((it) => it.code === code);
  return found ? found.name : null;
}

// 코드 → 라벨 변환
// - 정확히 매핑되면 라벨 반환
// - 5자리 코드인데 광역만 매칭 안되는 경우(시군구 코드 등): 시도명 + 시군구명 또는 "시도 (코드)"
// - 그 외: 코드 그대로 반환
export function regionLabel(code: string): string {
  if (!code) return "(미지정)";
  if (SIDO_NAMES[code]) return SIDO_NAMES[code];
  // 시군구 코드로 추정 — 앞 2자리 + "000"으로 시도 매칭
  if (code.length === 5) {
    const sidoCode = code.slice(0, 2) + "000";
    const sidoName = SIDO_NAMES[sidoCode];
    if (sidoName) {
      const sgName = sigunguName(code);
      if (sgName) return `${sidoName} ${sgName}`;
      return `${sidoName} (${code})`;
    }
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

// 소관기관명(agency)에서 시도 코드 추정 — 5자리 시도 코드 배열 반환
// 예: "서울특별시청" → ["11000"], "경기도 성남시" → ["41000"]
// - 정식 명("서울특별시", "경기도")을 우선 매칭
// - 실패 시 약칭("서울", "경기")으로 재시도
// - 어느 것도 매칭 안 되면 null (호출부에서 ["00000"] 등 기본값 사용)
export function regionFromAgency(
  agency: string | null | undefined,
): string[] | null {
  if (!agency) return null;

  // 1단계: 시·도 식별
  let sidoCode: string | null = null;
  // 1-a) 정식 명 그대로 포함
  for (const [code, name] of Object.entries(SIDO_NAMES)) {
    if (code === "00000") continue;
    if (agency.includes(name)) {
      sidoCode = code;
      break;
    }
  }
  // 1-b) 약칭 매칭 ("특별시/광역시/특별자치시/특별자치도/특별도" 또는 끝의 "도" 제거)
  if (!sidoCode) {
    for (const [code, name] of Object.entries(SIDO_NAMES)) {
      if (code === "00000") continue;
      const shortName = name
        .replace(/(특별자치시|특별자치도|특별시|광역시|특별도)$/, "")
        .replace(/도$/, "");
      if (shortName.length >= 2 && agency.includes(shortName)) {
        sidoCode = code;
        break;
      }
    }
  }
  if (!sidoCode) return null;

  // 2단계: 시·군·구 식별 (해당 시·도 안에서만 매칭)
  // "서울특별시 금천구" → 시·도 "11" + 시군구 "금천구" → "11545"
  const sidoPrefix = sidoCode.slice(0, 2);
  const sigunguList = SIGUNGU[sidoPrefix] ?? [];
  for (const { code, name } of sigunguList) {
    if (agency.includes(name)) return [code];
  }

  // 시·도만 식별되고 시·군·구 매칭 실패 → 시·도 단위 코드
  return [sidoCode];
}
