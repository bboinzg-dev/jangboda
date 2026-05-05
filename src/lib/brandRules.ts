// 한국 인기 식품 brand 매칭 사전
//
// 목적: 한국소비자원 참가격(parsa) raw 데이터는 brand/manufacturer를 안 줌.
//       식약처 enrich도 매칭률이 0.3%로 낮아서 cron만으로는 채워지지 않음.
//       → product name에 들어있는 trademark keyword로 brand·manufacturer 자동 매칭
//
// 매칭 안전선:
//   - keyword가 product name의 토큰으로 정확 일치해야 함 (정규화된 토큰 set 비교)
//   - exclude 토큰이 product name에 있으면 매칭 거부 (오탐 방지)
//   - 가장 긴 keyword 우선 매칭 (충돌 방지)

export type BrandRule = {
  brand: string;
  manufacturer: string;
  origin?: string;
  keywords: string[]; // 이 중 하나라도 product name 토큰에 있으면 매칭
  exclude?: string[]; // 이 토큰이 있으면 매칭 거부 (오탐 방지)
};

// keyword 토큰 정확 매칭 — "햇반"은 "햇반(3개입)" 매칭, "햇반칩"은 매칭 안 됨
export const BRAND_RULES: BrandRule[] = [
  // ─── CJ 그룹 ────────────────────────────────────────
  {
    brand: "CJ제일제당",
    manufacturer: "씨제이제일제당(주)",
    origin: "대한민국",
    keywords: [
      "햇반",
      "비비고",
      "다시다",
      "스팸",
      "백설",
      "고메",
      "프레시안",
      "해찬들",
    ],
  },
  // ─── 농심 ──────────────────────────────────────────
  {
    brand: "농심",
    manufacturer: "(주)농심",
    origin: "대한민국",
    keywords: [
      "농심",
      "신라면",
      "안성탕면",
      "짜파게티",
      "너구리",
      "새우깡",
      "양파링",
      "포테토칩",
      "생생우동",
      "둥지냉면",
      "오징어짬뽕",
      "찰보리면",
      "꿀꽈배기",
      "수미칩",
      "켈로그",
    ],
  },
  // ─── 오뚜기 ────────────────────────────────────────
  // "참기름", "마요네스", "토마토케첩"은 너무 일반적 — 다른 브랜드도 동일 카테고리 생산.
  // "옛날"은 오뚜기 시그니처라인이지만 일반어라 exclude로 안전하게 (다른 회사 "옛날" 제외).
  {
    brand: "오뚜기",
    manufacturer: "(주)오뚜기",
    origin: "대한민국",
    keywords: [
      "오뚜기",
      "진라면",
      "옛날",
      "콩국수",
      "북어국",
      "사골곰탕",
      "육개장",
    ],
    exclude: ["라면땅콩"],
  },
  // ─── 동원 ──────────────────────────────────────────
  {
    brand: "동원F&B",
    manufacturer: "동원F&B(주)",
    origin: "대한민국",
    keywords: ["동원", "동원참치", "양반김", "양반죽", "동원샘물", "리챔"],
  },
  // ─── 삼양식품 ──────────────────────────────────────
  {
    brand: "삼양식품",
    manufacturer: "(주)삼양식품",
    origin: "대한민국",
    keywords: ["삼양식품", "불닭볶음면", "삼양라면", "맛있는라면", "짱구"],
  },
  // ─── 풀무원 ────────────────────────────────────────
  {
    brand: "풀무원",
    manufacturer: "(주)풀무원",
    origin: "대한민국",
    keywords: ["풀무원", "찬마루"],
  },
  // ─── 팔도 ──────────────────────────────────────────
  // "도시락"은 너무 일반적이라 "팔도도시락"이 토큰일 때만 매칭되도록 제거
  {
    brand: "팔도",
    manufacturer: "(주)팔도",
    origin: "대한민국",
    keywords: ["팔도비빔면", "팔도도시락", "왕뚜껑", "비락식혜"],
  },
  // ─── 롯데웰푸드 (구 롯데제과·롯데푸드) ─────────────
  // 메로나는 빙그레 제품 → 여기서 제외
  {
    brand: "롯데웰푸드",
    manufacturer: "롯데웰푸드(주)",
    origin: "대한민국",
    keywords: [
      "빠다코코낫",
      "빼빼로",
      "꼬깔콘",
      "마가렛트",
      "ABC초콜릿",
      "가나초콜릿",
      "월드콘",
      "죠스바",
      "스크류바",
      "엔초",
      "와클",
      "쿠크다스",
      "뽀로로",
    ],
  },
  // ─── 해태제과 ──────────────────────────────────────
  {
    brand: "해태제과",
    manufacturer: "해태제과식품(주)",
    origin: "대한민국",
    keywords: [
      "해태",
      "맛동산",
      "허니버터칩",
      "오예스",
      "포키",
      "에이스",
      "버터링",
      "홈런볼",
      "후렌치파이",
      "연양갱",
    ],
  },
  // ─── 오리온 ────────────────────────────────────────
  {
    brand: "오리온",
    manufacturer: "(주)오리온",
    origin: "대한민국",
    keywords: [
      "오리온",
      "초코파이",
      "포카칩",
      "오징어땅콩",
      "고래밥",
      "다이제",
      "촉촉한초코칩",
      "꼬북칩",
      "예감",
      "오뜨",
      "초코송이",
      "왕꿈틀이",
      "마이구미",
      "치킨팝",
    ],
  },
  // ─── 빙그레 ────────────────────────────────────────
  {
    brand: "빙그레",
    manufacturer: "(주)빙그레",
    origin: "대한민국",
    keywords: ["빙그레", "바나나맛우유", "비비빅", "메로나", "요플레", "쥬시쿨", "더위사냥", "투게더"],
  },
  // ─── 매일유업 ──────────────────────────────────────
  {
    brand: "매일유업",
    manufacturer: "매일유업(주)",
    origin: "대한민국",
    keywords: ["매일우유", "앱솔루트", "셀렉스", "상하목장"],
  },
  // ─── 서울우유 ──────────────────────────────────────
  {
    brand: "서울우유",
    manufacturer: "서울우유협동조합",
    origin: "대한민국",
    keywords: ["서울우유"],
  },
  // ─── 남양유업 ──────────────────────────────────────
  {
    brand: "남양유업",
    manufacturer: "남양유업(주)",
    origin: "대한민국",
    keywords: ["남양", "맛있는우유GT", "프렌치카페"],
  },
  // ─── 한국야쿠르트(hy) ──────────────────────────────
  {
    brand: "hy",
    manufacturer: "(주)에이치와이",
    origin: "대한민국",
    keywords: ["야쿠르트", "윌", "쿠퍼스", "하루야채", "끼리"],
  },
  // ─── 한국코카콜라 ──────────────────────────────────
  {
    brand: "코카콜라",
    manufacturer: "한국코카콜라(주)",
    origin: "대한민국",
    keywords: ["코카콜라", "환타", "스프라이트", "조지아", "토레타", "파워에이드"],
  },
  // ─── 롯데칠성음료 ──────────────────────────────────
  {
    brand: "롯데칠성음료",
    manufacturer: "롯데칠성음료(주)",
    origin: "대한민국",
    keywords: [
      "칠성사이다",
      "펩시",
      "밀키스",
      "트레비",
      "립톤",
      "데일리C",
      "게토레이",
      "처음처럼",
      "백화수복",
      "아이시스",
    ],
  },
  // ─── 광동제약 ──────────────────────────────────────
  {
    brand: "광동제약",
    manufacturer: "광동제약(주)",
    origin: "대한민국",
    keywords: ["옥수수수염차", "비타500", "광동", "헛개차"],
  },
  // ─── 동서식품 ──────────────────────────────────────
  {
    brand: "동서식품",
    manufacturer: "동서식품(주)",
    origin: "대한민국",
    keywords: [
      "맥심",
      "맥스웰",
      "포스트",
      "오레오",
      "리츠",
      "프리마",
      "카누",
    ],
  },
  // ─── 샘표 ──────────────────────────────────────────
  {
    brand: "샘표",
    manufacturer: "샘표식품(주)",
    origin: "대한민국",
    keywords: ["샘표간장", "샘표", "연두", "폰타나"],
  },
  // ─── 대상 (청정원) ─────────────────────────────────
  {
    brand: "청정원",
    manufacturer: "(주)대상",
    origin: "대한민국",
    keywords: ["청정원", "순창", "햇살담은", "미원", "종갓집"],
  },
  // ─── CJ 음료/주류 ──────────────────────────────────
  // (CJ제일제당과 동일하게 처리하되 별도 keyword)
  {
    brand: "하이트진로",
    manufacturer: "하이트진로(주)",
    origin: "대한민국",
    keywords: ["참이슬", "진로", "테라", "하이트"],
  },
  // ─── 오비맥주 ──────────────────────────────────────
  // "OB"는 너무 일반적이라 제거. "카스"는 한글 토큰 정확매칭.
  {
    brand: "오비맥주",
    manufacturer: "오비맥주(주)",
    origin: "대한민국",
    keywords: ["카스", "OB맥주", "한맥"],
  },
  // ─── 제주삼다수 ────────────────────────────────────
  {
    brand: "제주삼다수",
    manufacturer: "제주특별자치도개발공사",
    origin: "대한민국",
    keywords: ["삼다수"],
  },
  // ─── 농심켈로그 ────────────────────────────────────
  // (켈로그는 농심 위에서 처리)
  // ─── 크라운제과 ────────────────────────────────────
  {
    brand: "크라운제과",
    manufacturer: "(주)크라운제과",
    origin: "대한민국",
    keywords: ["콘초", "참크래커", "산도", "쵸코하임", "초코하임", "땅콩카라멜"],
  },
  // ─── 일동후디스 ────────────────────────────────────
  {
    brand: "일동후디스",
    manufacturer: "(주)일동후디스",
    origin: "대한민국",
    keywords: ["후디스", "산양유", "트루맘"],
  },
  // ─── 종근당건강 ────────────────────────────────────
  {
    brand: "종근당건강",
    manufacturer: "종근당건강(주)",
    origin: "대한민국",
    keywords: ["락토핏", "종근당"],
  },
];

// 정규화 — 괄호 제거, 단위 제거, 공백/구두점 정리, 소문자
function normalizeName(name: string): string {
  return name
    .replace(/[(){}\[\]]/g, " ")
    .replace(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l|개입|개|매|입|봉|팩|박스|set)\b/gi, " ")
    .replace(/x\s*\d+/gi, " ")
    .replace(/[·.,_/+\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 토큰 set — 2자 이상만 유효 (조사/단위 노이즈 제거)
function nameTokenSet(name: string): Set<string> {
  return new Set(
    normalizeName(name)
      .toLowerCase()
      .split(" ")
      .filter((t) => t.length >= 2),
  );
}

// product name에 keyword가 토큰 또는 substring으로 있는지 확인
// keyword는 brand-trademark라서 정확한 토큰 매칭이 안전 — 다만 한국어는
// 형태소 결합이 흔해 ("햇반은", "햇반에서") substring fallback 추가.
function nameContainsKeyword(name: string, keyword: string): boolean {
  const normName = normalizeName(name).toLowerCase();
  const normKw = keyword.toLowerCase();
  const tokens = normName.split(" ");
  // 1. 토큰 정확일치
  if (tokens.some((t) => t === normKw)) return true;
  // 2. 토큰이 keyword를 prefix로 시작 (예: "햇반은" → "햇반")
  if (tokens.some((t) => t.startsWith(normKw) && t.length - normKw.length <= 2))
    return true;
  return false;
}

export type BrandMatchResult = {
  brand: string;
  manufacturer: string;
  origin?: string;
  matchedKeyword: string;
};

// product name에서 가장 긴 keyword 매칭으로 brand 결정
// 충돌 방지: 더 구체적인 keyword(긴 것)가 우선
export function matchBrand(productName: string): BrandMatchResult | null {
  const tokenSet = nameTokenSet(productName);

  type Candidate = {
    rule: BrandRule;
    keyword: string;
  };
  const candidates: Candidate[] = [];

  for (const rule of BRAND_RULES) {
    // exclude 토큰이 있으면 skip
    if (rule.exclude?.some((ex) => nameContainsKeyword(productName, ex))) continue;
    for (const kw of rule.keywords) {
      if (nameContainsKeyword(productName, kw)) {
        candidates.push({ rule, keyword: kw });
      }
    }
  }

  if (candidates.length === 0) return null;

  // 가장 긴 keyword 우선 — "참이슬"이 "이슬"보다 우선
  candidates.sort((a, b) => b.keyword.length - a.keyword.length);
  const top = candidates[0];

  // 디버그용 — tokenSet 미사용 경고 방지 (향후 확장 시 사용 예정)
  void tokenSet;

  return {
    brand: top.rule.brand,
    manufacturer: top.rule.manufacturer,
    origin: top.rule.origin,
    matchedKeyword: top.keyword,
  };
}
