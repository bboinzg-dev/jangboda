// 가계부 카테고리 분류 — 사용자가 한눈에 의미를 잡을 수 있는 메가 카테고리 8-10개로 그룹화
//
// 배경:
// - Product.category 자체가 "참가격 등록 상품" / "사용자 등록" 같은 데이터 출처 메타로 채워짐
//   → 가계부의 "카테고리별 소비"가 무의미한 분리가 됨
// - foodIngredientCategories.ts는 식재료 매칭용으로 80+ 키워드(우유/계란/치즈 별도)라
//   가계부엔 너무 세분화 → 그룹화 필요
//
// 정책: 1차는 런타임 파생만 (DB 안 건드림). 검증 후 nightly 배치로 Product.category UPDATE 가능.

import { FOOD_CATEGORY_RULES } from "./foodIngredientCategories";

export type BudgetCategory =
  | "신선식품"      // 육류·수산·채소·과일·계란
  | "유제품"        // 우유·치즈·버터·요거트·생크림
  | "가공·즉석식품" // 라면·통조림·즉석밥·냉동·간편식·만두·피자
  | "음료"          // 생수·탄산·주스·커피·차
  | "주류"          // 맥주·소주·와인·위스키
  | "양념·조미료"   // 고추장·소금·식용유·식초
  | "곡물·면·빵"    // 쌀·국수·식빵·바게트
  | "과자·간식"     // 과자·초콜릿·아이스크림
  | "생활용품"      // 휴지·세제·치약·기저귀
  | "기타";

// foodIngredientCategories의 세분화된 카테고리 → 메가 카테고리
const FOOD_TO_MEGA: Record<string, BudgetCategory> = {
  // 유제품
  우유: "유제품", 치즈: "유제품", 버터: "유제품", 요거트: "유제품", 생크림: "유제품",
  // 신선식품 (육류)
  돼지고기: "신선식품", 소고기: "신선식품", 닭고기: "신선식품", 오리고기: "신선식품",
  계란: "신선식품",
  // 신선식품 (수산)
  새우: "신선식품", 오징어: "신선식품", 낙지: "신선식품", 문어: "신선식품",
  명태: "신선식품", 고등어: "신선식품", 갈치: "신선식품", 연어: "신선식품",
  멸치: "신선식품", 김: "신선식품", 미역: "신선식품", 다시마: "신선식품",
  조개: "신선식품", 굴: "신선식품", 게: "신선식품",
  // 신선식품 (채소)
  양파: "신선식품", 파: "신선식품", 마늘: "신선식품", 생강: "신선식품",
  당근: "신선식품", 감자: "신선식품", 고구마: "신선식품", 무: "신선식품",
  양배추: "신선식품", 배추: "신선식품", 시금치: "신선식품", 콩나물: "신선식품",
  숙주: "신선식품", 호박: "신선식품", 오이: "신선식품", 가지: "신선식품",
  토마토: "신선식품", 파프리카: "신선식품", 피망: "신선식품", 고추: "신선식품",
  깻잎: "신선식품", 상추: "신선식품", 부추: "신선식품", 버섯: "신선식품",
  미나리: "신선식품", 청경채: "신선식품", 고사리: "신선식품", 연근: "신선식품", 우엉: "신선식품",
  // 신선식품 (과일)
  사과: "신선식품", 배: "신선식품", 귤: "신선식품", 오렌지: "신선식품",
  바나나: "신선식품", 딸기: "신선식품", 포도: "신선식품",
  // 가공식품
  "햄·소시지": "가공·즉석식품",
  참치: "가공·즉석식품", 맛살: "가공·즉석식품",
};

// 메가 카테고리 직접 매칭 — 식재료 휴리스틱이 못 잡는 가공식품·음료·생활용품 등
const DIRECT_PATTERNS: Array<{ pattern: RegExp; category: BudgetCategory }> = [
  // 음료 (탄산 우선)
  { pattern: /사이다|콜라|환타|밀키스|스프라이트|탄산수|제로|펩시/, category: "음료" },
  { pattern: /오렌지주스|사과주스|포도주스|주스/, category: "음료" },
  { pattern: /생수|광천수|미네랄워터|삼다수|에비앙|아이시스|백산수|평창|볼빅/, category: "음료" },
  { pattern: /커피|아메리카노|라떼|네스카페|맥심|카누/, category: "음료" },
  { pattern: /녹차|홍차|보이차|루이보스|티백|허브차/, category: "음료" },
  { pattern: /이온음료|포카리|파워에이드|게토레이|비타500|박카스/, category: "음료" },
  // 주류
  { pattern: /맥주|소주|와인|위스키|막걸리|청주|사케|증류주/, category: "주류" },
  { pattern: /카스\b|하이트|테라|클라우드|버드와이저|아사히|칭따오|호가든|코로나|구스아일랜드/, category: "주류" },
  { pattern: /참이슬|진로|처음처럼|좋은데이|한라산|일품진로/, category: "주류" },
  // 가공·즉석식품
  { pattern: /라면|면\b(?!류)|컵라면|짜파게티|짬뽕|육개장|진라면|신라면|안성탕면|너구리|삼양/, category: "가공·즉석식품" },
  { pattern: /즉석밥|햇반|오뮤|컵밥|냉동밥|볶음밥/, category: "가공·즉석식품" },
  { pattern: /만두|왕만두|군만두|찐만두|물만두|교자|딤섬/, category: "가공·즉석식품" },
  { pattern: /냉동|냉장식품|간편식|밀키트|레토르트|HMR/, category: "가공·즉석식품" },
  { pattern: /통조림|캔참치|캔커피|캔맥주|꽁치캔|연어캔/, category: "가공·즉석식품" },
  { pattern: /떡볶이|어묵|순대|핫도그|치킨너겟|돈까스|돈가스/, category: "가공·즉석식품" },
  { pattern: /피자\b|치킨\b/, category: "가공·즉석식품" },
  { pattern: /두부|순두부|콩나물국|찌개양념/, category: "가공·즉석식품" },
  // 양념·조미료
  { pattern: /고추장|된장|간장|쌈장|초장/, category: "양념·조미료" },
  { pattern: /소금|설탕|후추|미원|다시다|조미료|MSG/, category: "양념·조미료" },
  { pattern: /식용유|올리브유|참기름|들기름|카놀라유|코코넛오일/, category: "양념·조미료" },
  { pattern: /식초|굴소스|마요네즈|케찹|케첩|머스타드|시럽|스리라차/, category: "양념·조미료" },
  { pattern: /고춧가루|마늘가루|후추가루|생강가루/, category: "양념·조미료" },
  { pattern: /라면스프|국물용|육수/, category: "양념·조미료" },
  // 곡물·면·빵
  { pattern: /쌀\b(?!밥)|현미|찹쌀|흑미|보리쌀|귀리|오트밀/, category: "곡물·면·빵" },
  { pattern: /식빵|모닝빵|샌드위치빵|바게트|크로와상|크로아상|호밀빵|페이스트리|롤빵|단팥빵|소보로|크림빵/, category: "곡물·면·빵" },
  { pattern: /국수|소바|우동|파스타|스파게티|마카로니|냉면|쫄면/, category: "곡물·면·빵" },
  { pattern: /떡\b|가래떡|찰떡|인절미|시루떡/, category: "곡물·면·빵" },
  // 과자·간식
  { pattern: /과자|스낵|쿠키|크래커|비스킷|웨하스/, category: "과자·간식" },
  { pattern: /초콜릿|초코바|초코파이|킷캣|허쉬|가나/, category: "과자·간식" },
  { pattern: /캔디|사탕|껌\b|민트|스키틀즈/, category: "과자·간식" },
  { pattern: /아이스크림|빙그레|메로나|월드콘|돼지바|구구콘|폴라포|투게더|하겐다즈/, category: "과자·간식" },
  { pattern: /젤리|푸딩|카스타드|와플|에그타르트|마카롱/, category: "과자·간식" },
  { pattern: /새우깡|꼬깔콘|포카칩|허니버터칩|오징어칩|콘치즈|썬칩|프링글스|짱구|에이스/, category: "과자·간식" },
  // 생활용품
  { pattern: /휴지|화장지|키친타월|티슈|냅킨/, category: "생활용품" },
  { pattern: /세제|섬유유연제|섬유탈취제|표백제/, category: "생활용품" },
  { pattern: /치약|칫솔|샴푸|린스|컨디셔너|바디워시|비누|클렌저/, category: "생활용품" },
  { pattern: /기저귀|물티슈|아기물티슈/, category: "생활용품" },
  { pattern: /건전지|배터리|랩\b|호일|포일|위생장갑|일회용/, category: "생활용품" },
];

export function budgetCategoryOf(
  productName: string,
  productCategory?: string | null,
): BudgetCategory {
  // 1순위: product.category가 이미 의미있는 진짜 카테고리면 매핑
  if (productCategory) {
    const c = productCategory;
    if (
      c !== "참가격 등록 상품" &&
      c !== "사용자 등록" &&
      c !== "기타"
    ) {
      // 직접 메가 카테고리 키워드 매칭 (예: "라면/면류" → 가공·즉석식품)
      if (/라면|면류/.test(c)) return "가공·즉석식품";
      if (/유제품/.test(c)) return "유제품";
      if (/정육|축산|육류|수산/.test(c)) return "신선식품";
      if (/채소|과일|농산|신선/.test(c)) return "신선식품";
      if (/음료/.test(c)) return "음료";
      if (/주류|술/.test(c)) return "주류";
      if (/과자|간식/.test(c)) return "과자·간식";
      if (/생필|생활/.test(c)) return "생활용품";
      if (/양념|조미료|소스/.test(c)) return "양념·조미료";
      if (/곡물|쌀|면|빵|베이커리/.test(c)) return "곡물·면·빵";
      // foodIngredientCategories의 세분 카테고리 그대로 들어온 경우
      const mapped = FOOD_TO_MEGA[c];
      if (mapped) return mapped;
    }
  }

  // 2순위: 직접 메가 카테고리 패턴 (음료/가공/양념/생활용품 등 — foodIngredientCategories에 없는 그룹)
  for (const rule of DIRECT_PATTERNS) {
    if (rule.pattern.test(productName)) return rule.category;
  }

  // 3순위: foodIngredientCategories 휴리스틱 → 메가 그룹 매핑
  for (const rule of FOOD_CATEGORY_RULES) {
    if (rule.pattern.test(productName)) {
      const mapped = FOOD_TO_MEGA[rule.category];
      if (mapped) return mapped;
    }
  }

  return "기타";
}

// 카테고리별 표시 색상 (도넛/막대 차트용)
export const CATEGORY_COLORS: Record<BudgetCategory, string> = {
  신선식품: "#10b981",       // emerald — 채소·과일 신선함
  유제품: "#fbbf24",         // amber — 우유 노란
  "가공·즉석식품": "#f97316", // orange — 라면 따뜻
  음료: "#3b82f6",           // blue — 물·음료
  주류: "#a855f7",           // purple — 와인 보라
  "양념·조미료": "#dc2626",   // red — 고추장 빨강
  "곡물·면·빵": "#d97706",    // amber-darker — 곡물 갈색
  "과자·간식": "#ec4899",    // pink — 디저트
  생활용품: "#64748b",       // slate — 무채색
  기타: "#9ca3af",           // gray — 기타
};
