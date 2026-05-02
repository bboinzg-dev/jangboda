// Gemini 3 Pro Image Preview 호출 — 증명사진 생성.
// 서버 전용. API 키는 process.env.GEMINI_API_KEY에서만 읽고 응답에 절대 포함시키지 않음.

const MODEL_NAME = "gemini-3-pro-image-preview";
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

export type GeminiImageResult = {
  imageBase64: string;
  mimeType: string;
};

export async function callGeminiForIdPhoto(
  imageBase64: string,
  mimeType: string,
  prompt: string,
): Promise<GeminiImageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      temperature: 0.4,
    },
  };

  let res: Response;
  try {
    res = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("aborted") || msg.includes("timeout")) {
      throw new Error("응답 시간이 초과되었습니다. 다시 시도해주세요.");
    }
    throw new Error("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

  if (res.status === 400) {
    throw new Error("잘못된 요청입니다. 이미지 파일이 올바른지 확인해주세요.");
  }
  if (res.status === 403) {
    throw new Error("API 키가 유효하지 않거나 권한이 없습니다.");
  }
  if (res.status === 429) {
    throw new Error("API 사용량이 초과되었습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const errJson = (await res.json()) as { error?: { message?: string } };
      detail = errJson.error?.message ?? "";
    } catch {
      detail = (await res.text().catch(() => "")).slice(0, 200);
    }
    throw new Error(`API 오류 (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
    }[];
    promptFeedback?: { blockReason?: string };
  };

  const candidates = data.candidates ?? [];
  if (candidates.length === 0) {
    if (data.promptFeedback?.blockReason) {
      throw new Error(
        "이미지가 안전 필터에 의해 차단되었습니다. 다른 사진으로 시도해주세요.",
      );
    }
    throw new Error("API 응답에 결과가 없습니다. 다시 시도해주세요.");
  }

  const candidate = candidates[0];
  if (candidate.finishReason === "SAFETY") {
    throw new Error(
      "이미지가 안전 필터에 의해 차단되었습니다. 다른 사진으로 시도해주세요.",
    );
  }

  const parts = candidate.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData;
    if (inline?.data) {
      return {
        imageBase64: inline.data,
        mimeType: inline.mimeType ?? "image/png",
      };
    }
  }

  throw new Error(
    "AI가 이미지를 생성하지 못했습니다. 얼굴이 잘 보이는 다른 사진으로 시도해주세요.",
  );
}
