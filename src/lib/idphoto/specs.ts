// 증명사진 규격 + 배경색 정책 + Gemini 프롬프트.
// 서버 전용 — 프롬프트와 API 키가 클라이언트로 새지 않도록 페이지/컴포넌트에서 직접 import 금지.
// 페이지에서는 PHOTO_SPECS_PUBLIC, BACKGROUND_OPTIONS만 노출.
//
// 배경색 규정 출처 (2026-05 기준):
// - 한국 여권사진: 외교부 — 흰색 단색만 (그라데이션·비네트 불가)
// - 주민등록증: 행정안전부 — 흰색 권장, 옅은 단색 허용 (원색·그라데이션 X)
// - 운전면허증: 도로교통공단 — 2026-03-01부터 흰색 단색만 엄격 적용
// - 미국 비자(DS-160): 미 국무부 — 흰색·미색 무지(plain)
// - 중국 비자: 주한중국대사관 — 흰색만 (회색·그라데이션 불가)
// - 일본 비자: 일본 외무성 — 흰색·회백색 무지·무문양
// - 이력서/취업용·명함판: 공식 규정 없음 — 한국 사진관 표준은 옅은 블루/그레이 라디얼 그라데이션

// ─────────── 배경색 옵션 ───────────
// "솔리드(공식 증명사진)"와 "그라데이션(한국 사진관 스타일)"을 명확히 구분.
export type BackgroundKey =
  // 솔리드 — 공식 규정 호환
  | "white"
  | "off_white"
  | "light_gray"
  | "light_blue"
  | "dark_gray"
  // 그라데이션 — 한국 사진관 스타일 (이력서·명함판에 추천)
  | "light_gray_gradient"
  | "light_blue_gradient"
  | "sky_blue_gradient"
  | "navy_gradient";

export type BackgroundStyle = "solid" | "gradient";

export const BACKGROUND_OPTIONS: {
  key: BackgroundKey;
  label: string;
  style: BackgroundStyle;
  swatch: string; // UI 미리보기용 CSS color/gradient
  blurb: string;
}[] = [
  // 솔리드 5종
  {
    key: "white",
    label: "흰색",
    style: "solid",
    swatch: "#FFFFFF",
    blurb: "표준. 여권·민증·면허·비자 등 거의 모든 공식 증명사진",
  },
  {
    key: "off_white",
    label: "오프화이트",
    style: "solid",
    swatch: "#F4F1EC",
    blurb: "은은한 아이보리 — 흰색 대안",
  },
  {
    key: "light_gray",
    label: "옅은 회색",
    style: "solid",
    swatch: "#E5E7EB",
    blurb: "차분·정제된 느낌. 공무원/공기업 이력서",
  },
  {
    key: "light_blue",
    label: "옅은 블루",
    style: "solid",
    swatch: "#D9E4F2",
    blurb: "또렷·신뢰감",
  },
  {
    key: "dark_gray",
    label: "차콜",
    style: "solid",
    swatch: "#5C5F66",
    blurb: "진중한 인상. 임원/전문직",
  },
  // 그라데이션 4종 — 한국 사진관 표준 라디얼 그라데이션
  {
    key: "light_gray_gradient",
    label: "회색 그라데이션",
    style: "gradient",
    swatch: "radial-gradient(ellipse at center,#F0F2F5 0%,#C9CDD4 100%)",
    blurb: "한국 사진관 스타일 — 가운데가 밝고 가장자리로 어두워짐",
  },
  {
    key: "light_blue_gradient",
    label: "블루 그라데이션",
    style: "gradient",
    swatch: "radial-gradient(ellipse at center,#E6EEF8 0%,#A8C5E5 100%)",
    blurb: "이력서·취업사진 가장 인기 — 부드러운 블루 그라데이션",
  },
  {
    key: "sky_blue_gradient",
    label: "스카이블루 그라데이션",
    style: "gradient",
    swatch: "radial-gradient(ellipse at center,#BFD4EC 0%,#6F94C2 100%)",
    blurb: "전통 한국 스튜디오 룩 — 또렷한 블루",
  },
  {
    key: "navy_gradient",
    label: "네이비 그라데이션",
    style: "gradient",
    swatch: "radial-gradient(ellipse at center,#5A7FAE 0%,#2A4666 100%)",
    blurb: "프로페셔널 — 모서리가 어두운 비네트",
  },
];

// ─────────── 종류별 정책 ───────────
// strict_white: 공식 규정상 흰색 솔리드만. 다른 색·그라데이션 모두 거부.
// white_preferred: 흰색 권장이지만 정해진 솔리드 옵션까지 허용. 그라데이션은 불가.
// free: 자유 — 솔리드·그라데이션 모두 허용. recommended는 기본 선택값.
export type BackgroundPolicy =
  | { kind: "strict_white" }
  | { kind: "white_preferred"; allowed: BackgroundKey[] }
  | { kind: "free"; recommended: BackgroundKey };

// ─────────── PhotoSpec ───────────
export type PhotoSpec = {
  name: string;
  display: string;
  size: string;
  width_px: number;
  height_px: number;
  desc: string;
  backgroundPolicy: BackgroundPolicy;
  regulationNote: string;
};

export const PHOTO_SPECS: PhotoSpec[] = [
  {
    name: "여권사진",
    display: "여권사진 (3.5x4.5cm)",
    size: "3.5 x 4.5cm",
    width_px: 413,
    height_px: 531,
    desc: "해외여행용 대한민국 표준 여권사진",
    backgroundPolicy: { kind: "strict_white" },
    regulationNote:
      "외교부: 흰색 단색만. 그라데이션·비네트·음영 모두 불가. ※ AI 보정 사진은 공식 여권 신청에 인정되지 않을 수 있어요.",
  },
  {
    name: "주민등록증",
    display: "주민등록증 (3.5x4.5cm)",
    size: "3.5 x 4.5cm",
    width_px: 413,
    height_px: 531,
    desc: "주민등록증 발급 및 갱신용",
    backgroundPolicy: {
      kind: "white_preferred",
      allowed: ["white", "off_white", "light_gray", "light_blue"],
    },
    regulationNote:
      "행안부: 흰색 권장, 옅은 단색까지 허용. 빨강·노랑·검정 등 원색과 그라데이션은 불가.",
  },
  {
    name: "운전면허증",
    display: "운전면허증 (3.0x4.0cm)",
    size: "3.0 x 4.0cm",
    width_px: 354,
    height_px: 472,
    desc: "운전면허증 발급 및 갱신용",
    backgroundPolicy: { kind: "strict_white" },
    regulationNote:
      "도로교통공단: 2026-03-01부터 여권 규격 엄격 적용 — 흰색 단색만 허용.",
  },
  {
    name: "미국 비자",
    display: "미국 비자 (5.1x5.1cm)",
    size: "5.1 x 5.1cm",
    width_px: 600,
    height_px: 600,
    desc: "미국 비자 신청용 (2x2인치 정사각형)",
    backgroundPolicy: { kind: "strict_white" },
    regulationNote: "미 국무부 DS-160: 흰색·미색의 plain(무지) 배경만.",
  },
  {
    name: "중국 비자",
    display: "중국 비자 (3.3x4.8cm)",
    size: "3.3 x 4.8cm",
    width_px: 390,
    height_px: 567,
    desc: "중국 비자 신청용",
    backgroundPolicy: { kind: "strict_white" },
    regulationNote: "주한중국대사관: 흰색만 인정. 회색·그라데이션 모두 불가.",
  },
  {
    name: "일본 비자",
    display: "일본 비자 (4.5x4.5cm)",
    size: "4.5 x 4.5cm",
    width_px: 531,
    height_px: 531,
    desc: "일본 비자 신청용 (정사각형)",
    backgroundPolicy: {
      kind: "white_preferred",
      allowed: ["white", "off_white"],
    },
    regulationNote: "일본 외무성: 흰색 또는 회백색의 plain(무지·무문양) 배경.",
  },
  {
    name: "이력서/취업용",
    display: "이력서/취업용 (3.0x4.0cm)",
    size: "3.0 x 4.0cm",
    width_px: 354,
    height_px: 472,
    desc: "이력서, 입사지원서, 자기소개서 제출용",
    backgroundPolicy: { kind: "free", recommended: "light_blue_gradient" },
    regulationNote:
      "공식 규정 없음. 한국 사진관 표준은 옅은 블루/회색 라디얼 그라데이션. 회사 분위기에 맞춰 선택.",
  },
  {
    name: "반명함판",
    display: "반명함판 (3.0x4.0cm)",
    size: "3.0 x 4.0cm",
    width_px: 354,
    height_px: 472,
    desc: "각종 서류 제출용 반명함 크기",
    backgroundPolicy: {
      kind: "white_preferred",
      allowed: ["white", "off_white", "light_gray", "light_blue"],
    },
    regulationNote:
      "흰색이 가장 무난. 제출처에 따라 옅은 단색까지 선택 가능 (그라데이션은 비공식).",
  },
  {
    name: "명함판",
    display: "명함판 (5.0x7.0cm)",
    size: "5.0 x 7.0cm",
    width_px: 591,
    height_px: 827,
    desc: "명함 크기 증명사진",
    backgroundPolicy: { kind: "free", recommended: "light_gray_gradient" },
    regulationNote: "공식 규정 없음. 회색·블루 그라데이션 또는 차콜이 일반적.",
  },
  {
    name: "수능/시험용",
    display: "수능/시험용 (3.0x4.0cm)",
    size: "3.0 x 4.0cm",
    width_px: 354,
    height_px: 472,
    desc: "수능, 공무원시험, 각종 자격시험 접수용",
    backgroundPolicy: { kind: "strict_white" },
    regulationNote: "한국교육과정평가원 등: 흰색 단색 권장 (여권 규격 준용).",
  },
];

export const PHOTO_SPECS_PUBLIC = PHOTO_SPECS.map((s, idx) => ({
  idx,
  name: s.name,
  display: s.display,
  size: s.size,
  width_px: s.width_px,
  height_px: s.height_px,
  desc: s.desc,
  backgroundPolicy: s.backgroundPolicy,
  regulationNote: s.regulationNote,
}));

export function isBackgroundAllowed(
  policy: BackgroundPolicy,
  key: BackgroundKey,
): boolean {
  if (policy.kind === "strict_white") return key === "white";
  if (policy.kind === "white_preferred") return policy.allowed.includes(key);
  return true;
}

export function getDefaultBackground(policy: BackgroundPolicy): BackgroundKey {
  if (policy.kind === "strict_white") return "white";
  if (policy.kind === "white_preferred") return "white";
  return policy.recommended;
}

// ─────────── 프롬프트 (배경별 영문 설명) ───────────
const BACKGROUND_PROMPTS: Record<BackgroundKey, string> = {
  white:
    "Pure solid white (#FFFFFF / RGB 255,255,255). Completely uniform across the entire frame — every pixel must be the same value. ABSOLUTELY NO gradient, vignette, shading, lighting falloff, or color variation of any kind.",
  off_white:
    "Smooth solid off-white / ivory (#F4F1EC / RGB 244,241,236). Completely uniform — no gradient, no vignette, no texture.",
  light_gray:
    "Smooth solid light gray (#E5E7EB / RGB 229,231,235). Completely uniform — no gradient, no vignette, no texture.",
  light_blue:
    "Smooth solid light blue (#D9E4F2 / RGB 217,228,242). Completely uniform — no gradient, no vignette, no texture.",
  dark_gray:
    "Smooth solid charcoal gray (#5C5F66 / RGB 92,95,102). Completely uniform — no gradient, no vignette, no banding.",
  light_gray_gradient:
    "Soft radial gradient background, classic Korean photo studio style. Center near the subject is light gray (#F0F2F5 / RGB 240,242,245), corners fade to medium gray (#C9CDD4 / RGB 201,205,212). Smooth, no banding.",
  light_blue_gradient:
    "Soft radial gradient background, classic Korean photo studio style. Center near the subject is pale blue (#E6EEF8 / RGB 230,238,248), corners fade to light blue (#A8C5E5 / RGB 168,197,229). Smooth, no banding.",
  sky_blue_gradient:
    "Radial gradient background, Korean studio style. Center is sky blue (#BFD4EC / RGB 191,212,236), corners darken to deeper blue (#6F94C2 / RGB 111,148,194). Smooth gradient, no banding.",
  navy_gradient:
    "Professional navy radial vignette. Center is medium navy (#5A7FAE / RGB 90,127,174), corners darken to deep navy (#2A4666 / RGB 42,70,102). Smooth, no banding, classic studio portrait look.",
};

// 정책별로 프롬프트에 추가하는 STRICT 강제 문구.
// strict_white의 경우 "공식 규정 위반 결과물 금지" 메시지를 반복해 모델이 그라데이션을 절대 못 그리도록.
function getPolicyEnforcement(policy: BackgroundPolicy): string {
  if (policy.kind === "strict_white") {
    return `\n=== STRICT REGULATION ===
This is an OFFICIAL government-issued ID photo. The background MUST be a perfectly uniform solid white at every single pixel. Any gradient, vignette, lighting falloff, color shift, shading, drop shadow on the background, or visible texture will cause the photo to be REJECTED by the issuing authority. The output background must be exact uniform RGB(255,255,255).`;
  }
  if (policy.kind === "white_preferred") {
    return `\n=== REGULATION ===
This is an official ID photo. The background must be a uniform solid color across the entire frame — NO gradient, NO vignette, NO texture. Only the specified solid color is acceptable.`;
  }
  return "";
}

const BASE_PROMPT = `You are a premium Korean photo studio (한국 증명사진관) editor. Transform the provided photo into a polished, professional ID photo — the kind customers love and happily pay for.

=== IDENTITY (MUST KEEP) ===
The person must be clearly recognizable. Preserve their core identity:
- Face shape, jawline, forehead proportions
- Eye shape, size, color, and spacing
- Nose shape and size
- Lip shape and mouth proportions
- Ear shape and position
- Eyebrow shape and arch
- Hair color, style, and hairline
- Glasses frames if wearing (remove lens glare only)

=== SKIN RETOUCHING (KOREAN PHOTO STUDIO STYLE) ===
Apply natural, professional-grade skin retouching — the way premium Korean ID photo studios do:
- Gently smooth skin texture for a clean, refined look (not plastic or blurry — keep skin looking real)
- Remove temporary blemishes: acne, pimples, redness, dark spots, under-eye circles
- Even out skin tone for a bright, healthy, clean complexion
- Minimize visible pores and fine lines while keeping skin realistic
- NEVER add marks, spots, moles, or blemishes that do not exist in the original — only remove or soften imperfections
- NEVER fabricate any skin features, textures, or details that are not present in the input photo
- Keep permanent features like beauty marks only if they are clearly visible and prominent in the original

=== BACKGROUND ===
{background}{policy}

=== LIGHTING ===
Even, soft, flattering studio lighting on the SUBJECT only. Both sides of the face evenly lit. No harsh shadows on the face. The background lighting must NOT bleed onto the face nor create shadows on the background plate.

=== COMPOSITION ===
{composition}

=== EXPRESSION ===
{expression}

=== OUTPUT RULES ===
- Output ONLY the final ID photo — no borders, frames, text, watermarks, annotations, or side-by-side views
- Must look like a real, high-quality studio photograph — NOT AI-generated or overly processed
- Sharp focus, high resolution, no artifacts or distortion
- Natural, appealing color balance — warm and flattering but realistic
- The result must satisfy the official regulations for the requested ID photo type

Generate the photo now.`;

const COMPOSITIONS: Record<string, { composition: string; expression: string }> = {
  여권사진: {
    composition: `- Portrait orientation, width-to-height ratio of 3.5:4.5
- Face perfectly centered horizontally in the frame
- Head height (from crown of hair to bottom of chin) occupies 70-80% of total frame height
- Small margin of approximately 2-3mm above the crown of the head
- Both ears MUST be fully and clearly visible (push hair behind ears if necessary)
- Shoulders visible at bottom of frame, photo cropped at upper chest level
- Chin approximately 7-10mm equivalent from bottom edge`,
    expression:
      "Strictly neutral expression. Mouth completely closed, absolutely no smile, no teeth visible. Eyes open naturally and comfortably, looking directly straight at the camera lens. No tilting of the head.",
  },
  주민등록증: {
    composition: `- Portrait orientation, width-to-height ratio of 3.5:4.5
- Face perfectly centered horizontally
- Head height (crown to chin) occupies 65-75% of total frame height
- Margin of approximately 3-5mm above the head
- Both ears should be visible
- Shoulders visible, cropped at upper chest level`,
    expression:
      "Natural, neutral expression. Mouth closed. Eyes open and looking directly at camera. Relaxed, natural facial muscles.",
  },
  운전면허증: {
    composition: `- Portrait orientation, width-to-height ratio of 3:4
- Face centered horizontally in the frame
- Head height occupies 65-75% of frame height
- Shoulders clearly visible at bottom
- Both ears should be visible`,
    expression:
      "Neutral expression. Mouth closed. Eyes open, looking directly at camera.",
  },
  "미국 비자": {
    composition: `- SQUARE format, exact 1:1 aspect ratio (critical requirement)
- Head centered both horizontally and vertically
- Head height (top of hair to bottom of chin) must be between 50-69% of total photo height
- Eyes positioned in the center zone, between 56-69% from the bottom of the photo
- Full face clearly visible from front
- Both ears visible
- Shoulders visible at bottom`,
    expression:
      "Neutral expression with natural appearance. Eyes open and looking directly at camera. No smile, or only a very minimal, natural, closed-mouth expression.",
  },
  "중국 비자": {
    composition: `- Portrait orientation, width-to-height ratio of 3.3:4.8
- Face centered horizontally
- Head height occupies 70-75% of frame height
- Small margin above crown of head
- Both ears clearly visible
- Shoulders visible at bottom`,
    expression:
      "Strictly neutral expression. Mouth closed, no smile whatsoever. Eyes open, looking directly at camera.",
  },
  "일본 비자": {
    composition: `- SQUARE format, exact 1:1 aspect ratio
- Face centered horizontally
- Head height occupies 70-80% of frame height
- Both ears visible
- Shoulders visible at bottom`,
    expression:
      "Neutral expression. Mouth closed. Eyes open, looking directly at camera.",
  },
  "이력서/취업용": {
    composition: `- Portrait orientation, width-to-height ratio of 3:4
- Face centered horizontally
- Head height occupies 60-70% of frame height
- More upper body and shoulders visible for a professional, well-composed appearance
- Both ears preferably visible`,
    expression:
      "Professional, confident, and approachable appearance. A very slight, natural, closed-mouth smile is acceptable and encouraged. Eyes open and engaged, looking directly at camera. Should convey competence and warmth.",
  },
  반명함판: {
    composition: `- Portrait orientation, width-to-height ratio of 3:4
- Face centered horizontally
- Head height occupies 60-70% of frame height
- Shoulders visible at bottom`,
    expression:
      "Neutral to slightly pleasant expression. Mouth closed. Eyes open, looking at camera.",
  },
  명함판: {
    composition: `- Portrait orientation, width-to-height ratio of 5:7
- Face centered horizontally
- Head height occupies 50-60% of frame height (more body visible than smaller formats)
- Upper body well-framed with professional composition
- Both ears visible`,
    expression:
      "Professional, natural expression. Slight natural smile is acceptable. Eyes open, looking directly at camera.",
  },
  "수능/시험용": {
    composition: `- Portrait orientation, width-to-height ratio of 3:4
- Face centered horizontally
- Head height occupies 65-75% of frame height
- Both ears clearly visible
- Shoulders visible at bottom`,
    expression:
      "Neutral expression. Mouth closed. Eyes open, looking directly at camera. No accessories like hats or sunglasses.",
  },
};

export function getPrompt(
  spec: PhotoSpec,
  backgroundKey: BackgroundKey = "white",
): string {
  const data = COMPOSITIONS[spec.name] ?? COMPOSITIONS["반명함판"];
  const bg = BACKGROUND_PROMPTS[backgroundKey] ?? BACKGROUND_PROMPTS.white;
  const enforcement = getPolicyEnforcement(spec.backgroundPolicy);
  return BASE_PROMPT.replace("{composition}", data.composition)
    .replace("{expression}", data.expression)
    .replace("{background}", bg)
    .replace("{policy}", enforcement);
}
