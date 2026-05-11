"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onCapture: (dataUrl: string) => void;
  onCancel: () => void;
  facingMode?: "environment" | "user"; // 기본: environment (영수증 등 후면)
  title?: string; // 상단 표시 텍스트
  showGuide?: boolean; // 가이드 박스 표시 여부 (영수증용 박스)
};

// 인앱 카메라 캡처 — getUserMedia 기반
// 모바일: facingMode prop으로 전후면 선택 (기본 후면)
// 데스크톱: webcam 사용
export default function CameraCapture({
  onCapture,
  onCancel,
  facingMode = "environment",
  title = "📸 영수증 촬영",
  showGuide = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("이 브라우저는 카메라를 지원하지 않습니다");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.name === "NotAllowedError"
              ? "카메라 권한이 거부되었습니다 — 브라우저 설정에서 허용 후 다시 시도"
              : e.message
            : String(e);
        setError(msg);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);

    // JPEG 품질 0.85 (영수증 텍스트 보존하면서 용량 적정)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setShot(dataUrl);

    // stream 즉시 종료 (배터리/카메라 LED)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function retake() {
    setShot(null);
    setReady(false);
    // 다시 시작
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function use() {
    if (shot) onCapture(shot);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex justify-between items-center p-3 text-white">
        <span className="font-medium text-sm">{title}</span>
        <button
          onClick={onCancel}
          aria-label="닫기"
          className="text-white/80 hover:text-white text-xl px-2"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center relative overflow-hidden">
        {error ? (
          <div className="text-white text-center p-6">
            <div className="text-3xl mb-2">📵</div>
            <div className="text-sm mb-4">{error}</div>
            <button
              onClick={onCancel}
              className="bg-surface/10 hover:bg-surface/20 text-white px-4 py-2 rounded"
            >
              닫기
            </button>
          </div>
        ) : shot ? (
          // 미리보기 모드
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shot}
            alt="촬영 미리보기"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="max-h-full max-w-full object-contain"
            />
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                카메라 준비 중...
              </div>
            )}
            {/* 가이드 박스 (옵션) */}
            {ready && showGuide && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border-2 border-white/40 rounded-lg w-[80%] h-[80%] max-w-[420px] max-h-[600px]" />
              </div>
            )}
          </>
        )}
        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>

      {!error && (
        <div className="p-4 flex justify-center gap-3 bg-black">
          {shot ? (
            <>
              <button
                onClick={retake}
                className="bg-surface/15 hover:bg-surface/25 text-white px-5 py-3 rounded-full font-medium"
              >
                🔄 다시 찍기
              </button>
              <button
                onClick={use}
                className="bg-brand-500 hover:bg-brand-600 text-white px-6 py-3 rounded-full font-bold"
              >
                ✓ 이 사진 사용
              </button>
            </>
          ) : (
            <button
              onClick={capture}
              disabled={!ready}
              aria-label="촬영"
              className="bg-surface text-ink-1 w-16 h-16 rounded-full font-bold disabled:opacity-50 flex items-center justify-center text-2xl shadow-lg"
            >
              📸
            </button>
          )}
        </div>
      )}
    </div>
  );
}
