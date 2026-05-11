"use client";

import { useEffect, useRef, useState } from "react";
import CameraCapture from "@/components/CameraCapture";

// 정책 타입은 specs.ts와 동일하게 클라이언트에 복제 (server-only 모듈을 import하지 않기 위함)
export type BackgroundKey =
  | "white"
  | "off_white"
  | "light_gray"
  | "light_blue"
  | "dark_gray"
  | "light_gray_gradient"
  | "light_blue_gradient"
  | "sky_blue_gradient"
  | "navy_gradient";

export type BackgroundStyle = "solid" | "gradient";

export type BackgroundPolicy =
  | { kind: "strict_white" }
  | { kind: "white_preferred"; allowed: BackgroundKey[] }
  | { kind: "free"; recommended: BackgroundKey };

export type SpecPublic = {
  idx: number;
  name: string;
  display: string;
  size: string;
  width_px: number;
  height_px: number;
  desc: string;
  backgroundPolicy: BackgroundPolicy;
  regulationNote: string;
};

export type BackgroundOption = {
  key: BackgroundKey;
  label: string;
  style: BackgroundStyle;
  swatch: string;
  blurb: string;
};

function isBackgroundAllowed(
  policy: BackgroundPolicy,
  key: BackgroundKey,
): boolean {
  if (policy.kind === "strict_white") return key === "white";
  if (policy.kind === "white_preferred") return policy.allowed.includes(key);
  return true;
}

function getDefaultBackground(policy: BackgroundPolicy): BackgroundKey {
  if (policy.kind === "strict_white") return "white";
  if (policy.kind === "white_preferred") return "white";
  return policy.recommended;
}

const ACCEPT_MIME = "image/jpeg,image/png,image/webp";
const MAX_LONG_EDGE = 2048;
const TARGET_BYTES = 4 * 1024 * 1024;

// Canvas로 이미지 리사이즈 + JPEG 재인코딩 — 서버 전송량 최소화 + EXIF 회전 처리.
async function compressImageSource(
  source: File | Blob,
): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  const bitmap = await loadBitmap(source);
  const { width, height } = scaleDown(bitmap.width, bitmap.height, MAX_LONG_EDGE);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 컨텍스트를 생성할 수 없습니다.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  let quality = 0.92;
  let blob: Blob | null = null;
  for (let i = 0; i < 5; i++) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob) break;
    if (blob.size <= TARGET_BYTES) break;
    quality -= 0.1;
  }
  if (!blob) throw new Error("이미지 압축에 실패했습니다.");

  const base64 = await blobToBase64(blob);
  const previewUrl = URL.createObjectURL(blob);
  return { base64, mimeType: "image/jpeg", previewUrl };
}

async function loadBitmap(source: File | Blob): Promise<ImageBitmap> {
  // createImageBitmap이 EXIF orientation을 자동으로 적용
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(source, { imageOrientation: "from-image" });
    } catch {
      // 일부 브라우저에서 옵션 미지원 — 폴백으로 옵션 없이
      return await createImageBitmap(source);
    }
  }
  // 정말 옛날 브라우저용 폴백
  const url = URL.createObjectURL(source);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    return (await createImageBitmap(c)) as ImageBitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return await res.blob();
}

function scaleDown(w: number, h: number, max: number) {
  if (Math.max(w, h) <= max) return { width: w, height: h };
  const ratio = max / Math.max(w, h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = (reader.result as string) ?? "";
      const idx = data.indexOf(",");
      resolve(idx >= 0 ? data.slice(idx + 1) : data);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export default function IdPhotoStudio({
  specs,
  backgroundOptions,
}: {
  specs: SpecPublic[];
  backgroundOptions: BackgroundOption[];
}) {
  const [typeIdx, setTypeIdx] = useState(0);
  const [bgKey, setBgKey] = useState<BackgroundKey>(
    getDefaultBackground(specs[0].backgroundPolicy),
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string | null>(null);
  const [resultDataUrl, setResultDataUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const spec = specs[typeIdx];

  // 종류 변경 시 정책에 맞춰 배경 자동 보정 (현재 선택이 허용되지 않으면 기본값으로)
  useEffect(() => {
    if (!isBackgroundAllowed(spec.backgroundPolicy, bgKey)) {
      setBgKey(getDefaultBackground(spec.backgroundPolicy));
    }
    // bgKey가 종속적이라 spec 변경 시에만 보정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeIdx]);

  async function ingestSource(source: File | Blob) {
    setError(null);
    setResultDataUrl(null);
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const { base64, mimeType, previewUrl: pUrl } =
        await compressImageSource(source);
      setImageBase64(base64);
      setImageMime(mimeType);
      setPreviewUrl(pUrl);
    } catch (err) {
      setError((err as Error).message ?? "이미지를 읽을 수 없습니다.");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await ingestSource(file);
    // 같은 파일 재선택 가능하도록 input 초기화
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleCameraCapture(dataUrl: string) {
    setCameraOpen(false);
    const blob = await dataUrlToBlob(dataUrl);
    await ingestSource(blob);
  }

  async function handleProcess() {
    if (!imageBase64 || !imageMime) {
      setError("먼저 사진을 선택해주세요.");
      return;
    }
    setError(null);
    setBusy(true);
    setResultDataUrl(null);
    try {
      const res = await fetch("/api/idphoto/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          typeIdx,
          backgroundKey: bgKey,
          imageBase64,
          mimeType: imageMime,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        imageBase64?: string;
        mimeType?: string;
        spec?: { name?: string };
      };
      if (!res.ok) {
        if (res.status === 401) {
          setError("인증이 만료되었습니다. 새로고침 후 다시 시도해주세요.");
        } else {
          setError(data.error ?? "변환에 실패했습니다.");
        }
        return;
      }
      if (!data.imageBase64) {
        setError("응답에 이미지가 없습니다.");
        return;
      }
      const mime = data.mimeType ?? "image/png";
      setResultDataUrl(`data:${mime};base64,${data.imageBase64}`);
      setResultName(data.spec?.name ?? spec.name);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    if (!resultDataUrl) return;
    const a = document.createElement("a");
    a.href = resultDataUrl;
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "")
      .slice(0, 15);
    a.download = `증명사진_${resultName}_${stamp}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="space-y-6">
      <section className="bg-danger-soft border border-danger/30 rounded-2xl p-4">
        <div className="font-semibold text-sm text-danger mb-2">
          🎯 본인답게 나오는 비결 — 거리·렌즈·각도가 가장 중요해요
        </div>
        <p className="text-[11px] text-danger/80 mb-2 leading-relaxed">
          AI는 입력 사진의 얼굴 비례를 그대로 본인의 실제 얼굴로 보고 작업합니다.
          가까이서 찍은 셀카는 광각 왜곡으로 코·이마가 커지고 귀·턱이 작아지므로,
          결과물도 그대로 왜곡돼요.
        </p>
        <ul className="text-xs text-danger/80 leading-relaxed space-y-1 list-disc pl-5">
          <li>
            <b>📏 거리 1.5~2m</b> — 누군가에게 부탁하거나 삼각대+셀프타이머. 팔 뻗은
            셀카는 비례가 왜곡되니 비추천
          </li>
          <li>
            <b>🔭 줌 1.5~2x</b> — 광각 대신 살짝 망원 (아이폰 1x→2x, 갤럭시 1x→3x).
            사진관이 망원렌즈로 찍는 이유와 같음
          </li>
          <li>
            <b>📷 카메라는 눈 높이</b> — 위에서 내려찍기/아래서 올려찍기 X
          </li>
          <li>
            <b>🔍 얼굴이 충분히 크게</b> — 사진 안에서 얼굴 가로 400px 이상이 안정.
            너무 멀어서 콩알만 하면 AI가 디테일을 추측해 다른 사람 같아져요
          </li>
        </ul>
      </section>

      <section className="bg-warning-soft border border-warning/30 rounded-2xl p-4">
        <div className="font-semibold text-sm text-warning-text mb-2">
          💡 그 외 기본 가이드
        </div>
        <ul className="text-xs text-warning-text/80 leading-relaxed space-y-1 list-disc pl-5">
          <li>
            <b>정면 응시</b> · 고개·턱을 똑바로, 눈은 카메라 렌즈 정면을 바라보기
          </li>
          <li>
            <b>무표정 또는 입을 다문 살짝의 미소</b> — 치아가 보이는 큰 웃음은 피하기
          </li>
          <li>
            <b>머리부터 어깨</b>까지 프레임에 들어오게, 양쪽 귀가 보이면 더 좋음
          </li>
          <li>
            <b>밝은 곳</b>에서 · 양쪽 얼굴에 그림자가 지지 않는 균일한 빛
          </li>
          <li>
            <b>배경은 단색</b>(흰 벽/밝은 색)일수록 좋음
          </li>
          <li>
            <b>모자·선글라스·마스크 금지</b>, 안경은 빛 반사·렌즈 글레어 없게
          </li>
          <li>
            머리카락이 눈썹·눈을 가리지 않도록, 옷은 단색 상의 권장
          </li>
          <li>
            <b>흔들림·흐림·노이즈 X</b> — 흐릿한 사진은 AI가 추측으로 채워 본인 모습이 변형됨
          </li>
        </ul>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-5">
        <h2 className="font-semibold mb-3">1. 사진 선택</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-surface-muted hover:bg-surface-sunken rounded-lg text-sm font-semibold text-ink-2"
          >
            📂 갤러리에서 선택
          </button>
          <button
            type="button"
            onClick={() => setCameraOpen(true)}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-brand-soft hover:bg-brand-soft rounded-lg text-sm font-semibold text-brand-700"
          >
            📸 카메라로 찍기
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_MIME}
          onChange={handleFileChange}
          className="hidden"
        />
        <p className="text-[11px] text-ink-4 mt-2">
          JPEG / PNG / WEBP · 정면 얼굴이 선명한 사진이 좋아요.
        </p>
      </section>

      {cameraOpen && (
        <CameraCapture
          facingMode="user"
          title="📸 증명사진 촬영"
          showGuide={false}
          onCapture={handleCameraCapture}
          onCancel={() => setCameraOpen(false)}
        />
      )}

      <section className="bg-surface border border-line rounded-2xl p-5">
        <h2 className="font-semibold mb-3">2. 증명사진 종류</h2>
        <select
          value={typeIdx}
          onChange={(e) => setTypeIdx(Number(e.target.value))}
          className="w-full px-3 py-2.5 border border-line-strong rounded-lg text-sm bg-surface"
        >
          {specs.map((s) => (
            <option key={s.idx} value={s.idx}>
              {s.display}
            </option>
          ))}
        </select>
        <p className="text-xs text-ink-4 mt-2">{spec.desc}</p>
        <div className="mt-3 text-[11px] text-warning-text bg-warning-soft border border-warning/30 rounded-lg px-3 py-2 leading-relaxed">
          📜 <b>배경 규정:</b> {spec.regulationNote}
        </div>
      </section>

      <section className="bg-surface border border-line rounded-2xl p-5">
        <h2 className="font-semibold mb-1">3. 배경색</h2>
        <p className="text-xs text-ink-4 mb-3">
          {spec.backgroundPolicy.kind === "strict_white"
            ? "이 종류는 공식 규정상 흰색 단색만 사용 가능합니다."
            : spec.backgroundPolicy.kind === "white_preferred"
              ? "흰색 권장. 옅은 단색까지 선택 가능 (그라데이션은 비공식)."
              : "자유롭게 선택. 이력서·명함판은 그라데이션이 한국 사진관 표준입니다."}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {backgroundOptions.map((opt) => {
            const allowed = isBackgroundAllowed(spec.backgroundPolicy, opt.key);
            const selected = bgKey === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={!allowed}
                onClick={() => allowed && setBgKey(opt.key)}
                title={
                  allowed
                    ? `${opt.label} — ${opt.blurb}`
                    : `${opt.label} — 이 종류에서는 사용할 수 없습니다`
                }
                className={`relative rounded-lg border-2 p-1.5 transition ${
                  selected
                    ? "border-brand-500 ring-2 ring-brand-200"
                    : allowed
                      ? "border-line hover:border-line-strong"
                      : "border-line opacity-40 cursor-not-allowed"
                }`}
              >
                <div
                  className="aspect-square rounded w-full border border-line"
                  style={{ background: opt.swatch }}
                />
                <div className="text-[10px] mt-1 text-ink-2 truncate">
                  {opt.label}
                </div>
                {opt.style === "gradient" && (
                  <div className="absolute top-1 right-1 text-[8px] bg-stone-900/70 text-white rounded px-1 leading-tight">
                    GR
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-ink-4 mt-3 leading-relaxed">
          <b>현재 선택:</b>{" "}
          {backgroundOptions.find((o) => o.key === bgKey)?.label} —{" "}
          {backgroundOptions.find((o) => o.key === bgKey)?.blurb}
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="bg-surface border border-line rounded-2xl p-4">
          <div className="text-xs font-medium text-ink-4 mb-2">원본</div>
          <div className="aspect-[3.5/4.5] bg-surface-muted rounded-lg flex items-center justify-center overflow-hidden">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="원본 사진"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-ink-4">사진을 선택해주세요</span>
            )}
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-4">
          <div className="text-xs font-medium text-ink-4 mb-2">결과</div>
          <div className="aspect-[3.5/4.5] bg-surface-muted rounded-lg flex items-center justify-center overflow-hidden">
            {busy ? (
              <span className="text-xs text-ink-4 animate-pulse">
                AI가 만드는 중...
              </span>
            ) : resultDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resultDataUrl}
                alt="증명사진 결과"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-ink-4">변환 결과 표시</span>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="text-sm text-danger-text bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleProcess}
          disabled={busy || !imageBase64}
          className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:bg-line-strong disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl"
        >
          {busy ? "변환 중... (최대 1~2분)" : "🪄 변환하기"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!resultDataUrl}
          className="px-5 py-3 bg-surface border border-line-strong hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium"
        >
          저장
        </button>
      </div>

      <p className="text-[11px] text-ink-4 text-center leading-relaxed">
        ⚠️ 변환 시 외부 AI API가 호출되며 비용이 발생합니다.
        <br />
        한 번에 한 장씩, 사진을 신중히 선택해 주세요.
      </p>
    </div>
  );
}
