// 메이저 온라인 쇼핑몰 화이트리스트
// 네이버 검색 결과의 mallName이 너무 다양해서 (100+ 종류 가능)
// 사용자가 알아보기 쉬운 메이저 몰만 별도로 매핑하고, 나머지는 "기타 온라인몰"로 묶음

export const MAJOR_MALLS = [
  { canonical: "쿠팡", patterns: ["쿠팡"] },
  { canonical: "G마켓", patterns: ["g마켓", "지마켓", "gmarket"] },
  { canonical: "SSG.COM", patterns: ["ssg", "ssg.com"] },
  { canonical: "11번가", patterns: ["11번가", "11st"] },
  { canonical: "옥션", patterns: ["옥션", "auction"] },
  { canonical: "위메프", patterns: ["위메프", "wemakeprice"] },
  { canonical: "티몬", patterns: ["티몬", "tmon"] },
  { canonical: "인터파크", patterns: ["인터파크", "interpark"] },
  { canonical: "마켓컬리", patterns: ["컬리", "마켓컬리", "kurly"] },
  { canonical: "네이버쇼핑", patterns: ["네이버", "naver"] },
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
