// 정부 데이터(HWP에서 export)에 섞인 HTML 태그/엔티티를 제거해
// 사용자 화면에 깔끔한 텍스트만 표시한다.
//
// 입력 예: "공고 안내 <br /> 내용 <div data-hjsonver=\"1.0\" id=\"hwpEditorBoardContent\">&nbsp;</div>"
// 출력:    "공고 안내\n내용"

const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&middot;": "·",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
  "&times;": "×",
  "&copy;": "©",
};

function decodeEntities(s: string): string {
  let out = s.replace(/&[a-zA-Z]+;|&#\d+;/g, (m) => ENTITY_MAP[m] ?? m);
  // &#1234; 같은 숫자 코드도 변환
  out = out.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10)),
  );
  return out;
}

// HTML 태그 제거 + 엔티티 디코드 + 공백 정리
// 단순 텍스트 기반이라 외부 dependency 없음 (DOMParser 같은 것도 안 씀 — Node 환경 호환)
export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  let s = input;

  // <br>, <p>, </p>, </div>는 줄바꿈으로
  s = s.replace(/<br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\/p\s*>/gi, "\n\n");
  s = s.replace(/<\/div\s*>/gi, "\n");
  s = s.replace(/<\/li\s*>/gi, "\n");

  // 나머지 태그 모두 제거 (속성 포함)
  s = s.replace(/<[^>]*>/g, "");

  // 엔티티 디코드
  s = decodeEntities(s);

  // 연속 공백/줄바꿈 정리
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n\s+/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");

  return s.trim();
}
