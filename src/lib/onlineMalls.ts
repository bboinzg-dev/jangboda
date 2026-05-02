// 메이저 온라인 쇼핑몰 화이트리스트
// 네이버 검색 결과의 mallName이 너무 다양해서 (100+ 종류 가능)
// 사용자가 알아보기 쉬운 메이저 몰만 별도로 매핑하고, 나머지는 "기타 온라인몰"로 묶음

// 우선순위 중요: 마트/편의점 (오프라인과 같은 chain) → 종합몰
// 마트의 온라인몰 가격을 같은 chain으로 묶어 오프라인 매장과 함께 비교 가능
export const MAJOR_MALLS = [
  // 오프라인 마트 — 같은 이름의 chain에 통합
  { canonical: "이마트", patterns: ["이마트몰", "이마트", "emart", "트레이더스"] },
  { canonical: "롯데마트", patterns: ["롯데마트몰", "롯데마트", "롯데온", "lottemart", "lotteon"] },
  { canonical: "홈플러스", patterns: ["홈플러스익스프레스", "홈플러스", "homeplus"] },
  { canonical: "GS더프레시", patterns: ["gs더프레시", "gs프레시", "gsfresh", "더프레시"] },
  { canonical: "킴스클럽", patterns: ["킴스클럽", "kimsclub"] },
  { canonical: "코스트코", patterns: ["코스트코", "costco"] },
  { canonical: "농협하나로마트", patterns: ["하나로마트", "농협하나로", "nh하나로"] },
  // 편의점
  { canonical: "CU", patterns: ["cu포켓", "cu편의점"] },
  { canonical: "GS25", patterns: ["gs25"] },
  { canonical: "세븐일레븐", patterns: ["세븐일레븐", "7-eleven", "7일레븐"] },
  { canonical: "이마트24", patterns: ["이마트24"] },
  { canonical: "미니스톱", patterns: ["미니스톱", "ministop"] },
  // 종합 온라인몰
  { canonical: "쿠팡", patterns: ["쿠팡"] },
  { canonical: "G마켓", patterns: ["g마켓", "지마켓", "gmarket"] },
  { canonical: "SSG.COM", patterns: ["ssg.com", "ssg닷컴", "신세계몰"] },
  { canonical: "11번가", patterns: ["11번가", "11st"] },
  { canonical: "옥션", patterns: ["옥션", "auction"] },
  { canonical: "위메프", patterns: ["위메프", "wemakeprice"] },
  { canonical: "티몬", patterns: ["티몬", "tmon"] },
  { canonical: "인터파크", patterns: ["인터파크", "interpark"] },
  { canonical: "마켓컬리", patterns: ["컬리", "마켓컬리", "kurly"] },
  { canonical: "네이버쇼핑", patterns: ["네이버쇼핑", "naverpay"] },
];

// mall 이름을 정규화된 canonical 형태로 매핑 (메이저면 알려진 이름, 아니면 "기타 온라인몰")
export function canonicalMallName(rawMallName: string): {
  canonical: string;
  isMajor: boolean;
} {
  const lower = rawMallName.toLowerCase().replace(/[\s\-_.]/g, "");
  for (const m of MAJOR_MALLS) {
    if (m.patterns.some((p) => lower.includes(p.toLowerCase().replace(/\s/g, "")))) {
      return { canonical: m.canonical, isMajor: true };
    }
  }
  return { canonical: "기타 온라인몰", isMajor: false };
}
