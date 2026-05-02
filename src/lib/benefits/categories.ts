// 행안부 원본 서비스분야 카테고리를 사용자 친화 그룹으로 묶음
// 원본 카테고리는 종류가 많고 명칭도 비슷한 것들이 섞여 있어, 카탈로그 필터에서는
// 그룹 기준으로 묶어 노출한다. DB 저장 값은 원본 그대로 유지하고, 그룹 → 원본 배열
// 매핑을 통해 in 쿼리로 OR 검색한다.

// 그룹 → 해당 그룹에 속하는 원본 카테고리 목록
export const CATEGORY_GROUPS = {
  "일자리": ["고용·창업", "인력"],
  "사업·창업": ["경영", "창업", "수출", "기술", "내수"],
  "복지·생활": ["생활안정", "보건·의료", "보호·돌봄", "민생지원"],
  "가족·육아": ["보육·교육", "임신·출산"],
  "주거": ["주거·자립"],
  "문화·환경": ["문화·환경"],
  "농림수산": ["농림축산어업"],
  "행정": ["행정·안전"],
  "금융": ["금융"],
  "기타": ["기타"],
} as const;

export type CategoryGroup = keyof typeof CATEGORY_GROUPS;

// 그룹명 목록 — 필터 select 옵션 등에서 사용 (선언 순서 유지)
export const CATEGORY_GROUP_KEYS: CategoryGroup[] = Object.keys(
  CATEGORY_GROUPS,
) as CategoryGroup[];

// 원본 → 그룹 역매핑 (모듈 로드 시 1회 빌드)
export const CATEGORY_TO_GROUP: Record<string, string> = {};
for (const [group, originals] of Object.entries(CATEGORY_GROUPS)) {
  for (const o of originals) CATEGORY_TO_GROUP[o] = group;
}

// 원본 카테고리 → 그룹명 (매핑 없으면 "기타")
export function categoryGroup(category: string | null | undefined): string {
  if (!category) return "기타";
  return CATEGORY_TO_GROUP[category] ?? "기타";
}

// 그룹명 → 그 그룹에 속하는 원본 카테고리 배열 (where: { category: { in: [...] } } 용)
// 잘못된 그룹명이면 빈 배열 반환
export function originalsForGroup(group: string): string[] {
  const arr = (CATEGORY_GROUPS as Record<string, readonly string[]>)[group];
  return arr ? [...arr] : [];
}
