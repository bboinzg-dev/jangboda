// 식재료 카테고리 정규화 — 장바구니/레시피 재료 매칭용
// 목적: "매일우유 저지방", "서울우유 흰우유" 같은 다양한 표현을 "우유"로 통일

export type FoodCategoryRule = { pattern: RegExp; category: string };

// 우선순위 순서 — 더 구체적인 규칙이 먼저 (예: "닭갈비"보다 "닭"가 위면 안됨)
export const FOOD_CATEGORY_RULES: FoodCategoryRule[] = [
  // 유제품/계란
  { pattern: /우유|연유|분유/, category: "우유" },
  { pattern: /계란|달걀/, category: "계란" },
  { pattern: /치즈/, category: "치즈" },
  { pattern: /버터|마가린/, category: "버터" },
  { pattern: /요거트|요구르트/, category: "요거트" },
  { pattern: /생크림|휘핑크림/, category: "생크림" },

  // 육류
  { pattern: /돼지|삼겹|목살|뒷다리살|앞다리살|항정|갈비살|등갈비|족발/, category: "돼지고기" },
  { pattern: /소고기|쇠고기|한우|등심|안심|채끝|차돌|양지|불고기감|꽃등심/, category: "소고기" },
  { pattern: /닭가슴|닭다리|닭날개|닭안심|닭봉|닭(?!갈비)/, category: "닭고기" },
  { pattern: /오리고기|훈제오리/, category: "오리고기" },
  { pattern: /햄\b|소시지|베이컨|스팸|런천미트/, category: "햄·소시지" },

  // 수산물
  { pattern: /새우/, category: "새우" },
  { pattern: /오징어/, category: "오징어" },
  { pattern: /낙지/, category: "낙지" },
  { pattern: /문어/, category: "문어" },
  { pattern: /명태|동태|코다리|북어|황태/, category: "명태" },
  { pattern: /고등어/, category: "고등어" },
  { pattern: /갈치/, category: "갈치" },
  { pattern: /참치|튜나/, category: "참치" },
  { pattern: /연어/, category: "연어" },
  { pattern: /멸치/, category: "멸치" },
  { pattern: /김(?!치|밥)/, category: "김" },
  { pattern: /미역/, category: "미역" },
  { pattern: /다시마/, category: "다시마" },
  { pattern: /바지락|모시조개|홍합|조개/, category: "조개" },
  { pattern: /굴\b/, category: "굴" },
  { pattern: /꽃게|게(?!맛살)/, category: "게" },
  { pattern: /게맛살|맛살/, category: "맛살" },

  // 채소
  { pattern: /양파/, category: "양파" },
  { pattern: /대파|쪽파|실파|파\s*(?:한|두)?(?:단|뿌리)/, category: "파" },
  { pattern: /마늘/, category: "마늘" },
  { pattern: /생강/, category: "생강" },
  { pattern: /당근/, category: "당근" },
  { pattern: /감자(?!튀김|칩)/, category: "감자" },
  { pattern: /고구마/, category: "고구마" },
  { pattern: /무말랭이|무\b|총각무|알타리/, category: "무" },
  { pattern: /양배추/, category: "양배추" },
  { pattern: /배추/, category: "배추" },
  { pattern: /시금치/, category: "시금치" },
  { pattern: /콩나물/, category: "콩나물" },
  { pattern: /숙주/, category: "숙주" },
  { pattern: /애호박|단호박|호박/, category: "호박" },
  { pattern: /오이/, category: "오이" },
  { pattern: /가지\b/, category: "가지" },
  { pattern: /방울토마토|토마토/, category: "토마토" },
  { pattern: /파프리카/, category: "파프리카" },
  { pattern: /피망/, category: "피망" },
  { pattern: /청양고추|풋고추|홍고추|고추(?!장|가루|기름)/, category: "고추" },
  { pattern: /깻잎/, category: "깻잎" },
  { pattern: /로메인|양상추|상추/, category: "상추" },
  { pattern: /부추/, category: "부추" },
  { pattern: /표고|새송이|팽이|양송이|느타리|버섯/, category: "버섯" },
  { pattern: /미나리/, category: "미나리" },
  { pattern: /청경채/, category: "청경채" },
  { pattern: /고사리/, category: "고사리" },
  { pattern: /연근/, category: "연근" },
  { pattern: /우엉/, category: "우엉" },

  // 과일
  { pattern: /사과/, category: "사과" },
  { pattern: /배\s*(?:한|두|개|봉)|^배$|배[\s,]/, category: "배" },
  { pattern: /감귤|만다린|귤/, category: "귤" },
  { pattern: /오렌지/, category: "오렌지" },
  { pattern: /바나나/, category: "바나나" },
  { pattern: /딸기/, category: "딸기" },
  { pattern: /포도/, category: "포도" },
  { pattern: /수박/, category: "수박" },
  { pattern: /참외/, category: "참외" },
  { pattern: /복숭아/, category: "복숭아" },
  { pattern: /자두/, category: "자두" },
  { pattern: /키위/, category: "키위" },
  { pattern: /블루베리/, category: "블루베리" },

  // 곡물/면
  { pattern: /찹쌀|흑미|현미|백미|쌀\b/, category: "쌀" },
  { pattern: /보리|귀리|오트밀/, category: "보리" },
  { pattern: /떡(?!볶이)/, category: "떡" },
  { pattern: /국수|소면|중면|냉면|우동|소바|메밀면/, category: "면" },
  { pattern: /라면/, category: "라면" },
  { pattern: /파스타|스파게티/, category: "파스타" },
  { pattern: /식빵|토스트|바게트|크루아상|모닝빵|빵\b/, category: "빵" },
  { pattern: /밀가루|박력분|중력분|강력분/, category: "밀가루" },

  // 콩/두부
  { pattern: /연두부|찌개두부|부침두부|두부\b/, category: "두부" },
  { pattern: /메주콩|서리태|렌틸콩|병아리콩|콩\b|대두/, category: "콩" },

  // 양념/소스
  { pattern: /된장/, category: "된장" },
  { pattern: /고추장/, category: "고추장" },
  { pattern: /진간장|국간장|양조간장|간장/, category: "간장" },
  { pattern: /식초|2배식초|사과식초|현미식초/, category: "식초" },
  { pattern: /미림|맛술/, category: "맛술" },
  { pattern: /청주/, category: "청주" },
  { pattern: /고춧가루/, category: "고춧가루" },
  { pattern: /후추(?:가루)?/, category: "후추" },
  { pattern: /참기름|들기름/, category: "참기름" },
  { pattern: /콩기름|카놀라유|옥수수유|식용유/, category: "식용유" },
  { pattern: /올리브유|올리브오일/, category: "올리브유" },
  { pattern: /케찹|케첩/, category: "케찹" },
  { pattern: /마요네즈|마요/, category: "마요네즈" },
  { pattern: /굴소스/, category: "굴소스" },

  // 기타
  { pattern: /김치(?!찌개)/, category: "김치" },
  { pattern: /물\b|생수|정수/, category: "물" },
  { pattern: /소금/, category: "소금" },
  { pattern: /올리고당|꿀\b|시럽|설탕/, category: "설탕" },
  { pattern: /깨소금|참깨|들깨|깨\b/, category: "깨" },
];

/** 단일 재료 raw 텍스트를 표준 카테고리로 변환. 매칭 안 되면 null */
export function normalizeIngredient(raw: string): string | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;
  for (const { pattern, category } of FOOD_CATEGORY_RULES) {
    if (pattern.test(cleaned)) return category;
  }
  return null;
}

/** raw 배열 → 정규 카테고리 unique 배열 (매핑 안 된 항목은 drop) */
export function uniqueCategories(items: string[]): string[] {
  const set = new Set<string>();
  for (const it of items) {
    const c = normalizeIngredient(it);
    if (c) set.add(c);
  }
  return [...set];
}

/**
 * 레시피 재료 토큰 배열을 카테고리 set + 미매칭 raw set으로 분리.
 * 매핑된 카테고리는 정규화 비교에 사용. 미매칭 raw는 정확 일치 fallback에 사용.
 */
export function buildIngredientIndex(tokens: string[]): {
  categories: Set<string>;
  rawTokens: Set<string>;
} {
  const categories = new Set<string>();
  const rawTokens = new Set<string>();
  for (const t of tokens) {
    const c = normalizeIngredient(t);
    if (c) categories.add(c);
    else rawTokens.add(t.trim());
  }
  return { categories, rawTokens };
}
