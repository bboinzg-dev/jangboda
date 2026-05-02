// 증명사진 규격 + Gemini 프롬프트 (NanoBananaPro/app.py 포팅).
// 서버 전용 — 프롬프트와 API 키가 클라이언트로 새지 않도록 페이지/컴포넌트에서 직접 import 금지.
// 페이지에서는 PHOTO_SPECS_PUBLIC만 노출.

export type PhotoSpec = {
  name: string;
  display: string;
  size: string;
  width_px: number;
  height_px: number;
  desc: string;
};

export const PHOTO_SPECS: PhotoSpec[] = [
  {
    name: "여권사진",
    display: "여권사진 (3.5x4.5cm)",
    size: "3.5 x 4.5cm",
    width_px: 413,
    height_px: 531,
    desc: "해외여행용 대한민국 표준 여권사진",
  },
  {
    name: "주민등록증",
    display: "주민등록증 (3.5x4.5cm)",
    size: "3.5 x 4.5cm",
    width_px: 413,
    height_px: 531,
    desc: "주민등록증 발급 및 갱신용",
  },
  {
    name: "운전면허증",
    display: "운전면허증 (3.0x4.0cm)",
    size: "3.0 x 4.0cm",
    width_px: 354,
    height_px: 472,
    desc: "운전면허증 발급 및 갱신용",
  },
  {
    name: "미국 비자",
    display: "미국 비자 (5.1x5.1cm)",
    size: "5.1 x 5.1cm",
    width_px: 600,
    height_px: 600,
    desc: "미국 비자 신청용 (2x2인치 정사각형)",
  },
  {
    name: "중국 비자",
    display: "중국 비자 (3.3x4.8cm)",
    size: "3.3 x 4.8cm",
    width_px: 390,
    height_px: 567,
    desc: "중국 비자 신청용",
  },
  {
    name: "일본 비자",
    display: "일본 비자 (4.5x4.5cm)",
    size: "4.5 x 4.5cm",
    width_px: 531,
    height_px: 531,
    desc: "일본 비자 신청용 (정사각형)",
  },
  {
    name: "이력서/취업용",
    display: "이력서/취업용 (3.0x4.0cm)",
    size: "3.0 x 4.0cm",
    width_px: 354,
    height_px: 472,
    desc: "이력서, 입사지원서, 자기소개서 제출용",
  },
  {
    name: "반명함판",
    display: "반명함판 (3.0x4.0cm)",
    size: "3.0 x 4.0cm",
    width_px: 354,
    height_px: 472,
    desc: "각종 서류 제출용 반명함 크기",
  },
  {
    name: "명함판",
    display: "명함판 (5.0x7.0cm)",
    size: "5.0 x 7.0cm",
    width_px: 591,
    height_px: 827,
    desc: "명함 크기 증명사진",
  },
  {
    name: "수능/시험용",
    display: "수능/시험용 (3.0x4.0cm)",
    size: "3.0 x 4.0cm",
    width_px: 354,
    height_px: 472,
    desc: "수능, 공무원시험, 각종 자격시험 접수용",
  },
];

// 클라이언트로 보내도 되는 메타 (프롬프트 제외).
export const PHOTO_SPECS_PUBLIC = PHOTO_SPECS.map((s, idx) => ({
  idx,
  name: s.name,
  display: s.display,
  size: s.size,
  width_px: s.width_px,
  height_px: s.height_px,
  desc: s.desc,
}));

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
Pure solid white (#FFFFFF). Completely clean and uniform — no shadows, gradients, or artifacts.

=== LIGHTING ===
Even, soft, flattering studio lighting. Both sides of the face evenly lit. No harsh shadows. The lighting should make the person look their best while remaining natural.

=== COMPOSITION ===
{composition}

=== EXPRESSION ===
{expression}

=== OUTPUT RULES ===
- Output ONLY the final ID photo — no borders, frames, text, watermarks, annotations, or side-by-side views
- Must look like a real, high-quality studio photograph — NOT AI-generated or overly processed
- Sharp focus, high resolution, no artifacts or distortion
- Natural, appealing color balance — warm and flattering but realistic
- The result should look like a photo the person would be happy to use on official documents

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

export function getPrompt(specName: string): string {
  const data = COMPOSITIONS[specName] ?? COMPOSITIONS["반명함판"];
  return BASE_PROMPT.replace("{composition}", data.composition).replace(
    "{expression}",
    data.expression,
  );
}
