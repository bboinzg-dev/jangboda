"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";

// 바코드 스캐너 페이지
// - BarcodeDetector API (Chrome/Edge/Android 지원, iOS Safari 미지원)
// - 미지원 환경: 수동 입력 fallback
// - 인식 시 진동 + visual flash → /api/scan/[barcode] lookup
// - 결과: 매장별 가격 비교 또는 식약처 카탈로그 정보

type ScanResult = {
  found: boolean;
  source: "db" | "foodsafety" | "none";
  barcode?: string;
  product?: {
    id: string;
    name: string;
    brand: string | null;
    category: string;
    unit: string;
    barcode: string | null;
    hasHaccp: boolean;
  };
  prices?: Array<{
    id: string;
    price: number;
    source: string;
    storeName: string;
    chainName: string;
  }>;
  foodsafety?: {
    barcode: string;
    productName: string;
    manufacturer: string;
    foodType: string;
  };
  error?: string;
};

// BarcodeDetector type (TypeScript에 기본 정의 없음 — 최소한의 shim)
type BarcodeFormat =
  | "ean_13"
  | "ean_8"
  | "upc_a"
  | "upc_e"
  | "code_128"
  | "code_39"
  | "qr_code";
interface BarcodeDetectorResult {
  rawValue: string;
  format: BarcodeFormat;
}
interface BarcodeDetectorClass {
  new (opts?: { formats?: BarcodeFormat[] }): {
    detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
  };
}

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{ detect: (s: HTMLVideoElement) => Promise<BarcodeDetectorResult[]> } | null>(null);
  const scanLoopRef = useRef<number | null>(null);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(false);

  // BarcodeDetector 지원 여부 확인
  useEffect(() => {
    const w = window as unknown as { BarcodeDetector?: BarcodeDetectorClass };
    setSupported(typeof w.BarcodeDetector === "function");
  }, []);

  async function startCamera() {
    setError(null);
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // 후면 카메라
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const w = window as unknown as { BarcodeDetector?: BarcodeDetectorClass };
      if (!w.BarcodeDetector) {
        setError("이 브라우저는 바코드 인식을 지원하지 않습니다. 아래 입력란을 사용하세요.");
        return;
      }
      detectorRef.current = new w.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
      });
      setScanning(true);
      runDetectLoop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`카메라 권한 필요: ${msg}`);
    }
  }

  function stopCamera() {
    if (scanLoopRef.current) {
      cancelAnimationFrame(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }

  // mount/unmount 정리
  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runDetectLoop() {
    const tick = async () => {
      if (!videoRef.current || !detectorRef.current || !scanning) {
        return;
      }
      try {
        const results = await detectorRef.current.detect(videoRef.current);
        if (results.length > 0) {
          const code = results[0].rawValue;
          // 진동 + 스캔 정지 + lookup
          if ("vibrate" in navigator) navigator.vibrate(60);
          setFlash(true);
          setTimeout(() => setFlash(false), 200);
          stopCamera();
          await lookupBarcode(code);
          return;
        }
      } catch {
        // detect 에러 무시 (loop 계속)
      }
      scanLoopRef.current = requestAnimationFrame(tick);
    };
    scanLoopRef.current = requestAnimationFrame(tick);
  }

  async function lookupBarcode(code: string) {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(code)}`);
      const data = (await res.json()) as ScanResult;
      setResult({ ...data, barcode: code });
    } catch (e) {
      setResult({
        found: false,
        source: "none",
        barcode: code,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = manualInput.trim();
    if (!/^\d{8,14}$/.test(trimmed)) {
      setError("바코드는 8~14자리 숫자여야 합니다");
      return;
    }
    setError(null);
    lookupBarcode(trimmed);
  }

  function reset() {
    setResult(null);
    setManualInput("");
    setError(null);
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-1">📷 바코드 스캐너</h1>
        <p className="text-sm text-stone-500 leading-relaxed">
          마트에서 상품 바코드를 찍으면 우리 DB의 매장별 가격을 비교하고,
          식약처 카탈로그에서 제조사 정보를 보여드려요.
        </p>
      </div>

      {/* 카메라 viewport */}
      {!result && (
        <section className="bg-stone-900 rounded-xl overflow-hidden relative aspect-video">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {/* 스캔 가이드라인 */}
          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-3/4 h-1/3 border-2 border-brand-400 rounded-lg shadow-lg shadow-brand-500/50" />
            </div>
          )}
          {/* 인식 flash 효과 */}
          {flash && (
            <div className="absolute inset-0 bg-success/40 pointer-events-none" />
          )}
          {/* 시작/정지 버튼 */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            {!scanning ? (
              <button
                onClick={startCamera}
                className="btn-primary"
              >
                {supported === false ? "📷 카메라만 켜기 (인식 미지원)" : "📷 스캔 시작"}
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="btn-secondary"
              >
                정지
              </button>
            )}
          </div>
          {/* 안내 메시지 */}
          {scanning && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
              상품 바코드를 가운데에 맞춰주세요
            </div>
          )}
        </section>
      )}

      {/* 수동 입력 fallback */}
      {!result && (
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="바코드 직접 입력 (8~14자리 숫자)"
            className="input-base flex-1"
          />
          <button type="submit" className="btn-primary shrink-0">
            🔍 조회
          </button>
        </form>
      )}

      {error && (
        <div className="text-sm text-danger-text bg-danger-soft border border-danger-soft rounded-lg p-3">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center text-sm text-stone-500 py-6">
          바코드 조회 중...
        </div>
      )}

      {/* 결과 */}
      {result && !loading && (
        <section className="bg-white border border-border rounded-xl p-4 md:p-5 space-y-3">
          {result.found && result.product && (
            <>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="badge-success">✓ 우리 DB 매칭</span>
                <span className="text-xs text-stone-400">{result.barcode}</span>
              </div>
              <div>
                <div className="text-xs text-stone-500">{result.product.category}</div>
                <h2 className="text-xl font-bold">{result.product.name}</h2>
                <div className="text-sm text-stone-500">{result.product.unit}</div>
              </div>
              {result.prices && result.prices.length > 0 ? (
                <div>
                  <div className="text-xs font-semibold text-stone-700 mb-2">
                    📍 매장별 가격 ({result.prices.length}건, 최저가 순)
                  </div>
                  <ul className="space-y-1.5 max-h-72 overflow-y-auto">
                    {[...result.prices]
                      .sort((a, b) => a.price - b.price)
                      .slice(0, 10)
                      .map((p, i) => (
                        <li
                          key={p.id}
                          className={`flex items-center justify-between p-2 rounded border ${
                            i === 0
                              ? "border-brand-400 bg-brand-50/30"
                              : "border-border"
                          }`}
                        >
                          <div>
                            {i === 0 && (
                              <span className="badge-success mr-1">최저</span>
                            )}
                            <span className="text-sm font-medium">
                              {p.chainName}
                            </span>
                            <span className="text-xs text-stone-500 ml-1.5">
                              {p.storeName}
                            </span>
                          </div>
                          <span className="font-bold text-stone-900">
                            {formatWon(p.price)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : (
                <div className="text-sm text-stone-500">
                  등록된 가격이 아직 없어요
                </div>
              )}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Link
                  href={`/products/${result.product.id}`}
                  className="btn-primary flex-1 text-sm"
                >
                  상세 보기
                </Link>
                <button onClick={reset} className="btn-secondary text-sm">
                  다시 스캔
                </button>
              </div>
            </>
          )}

          {result.found && !result.product && result.foodsafety && (
            <>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="badge-info">📋 식약처 카탈로그</span>
                <span className="text-xs text-stone-400">{result.barcode}</span>
              </div>
              <div>
                <h2 className="text-xl font-bold">
                  {result.foodsafety.productName}
                </h2>
                <div className="text-sm text-stone-500">
                  {result.foodsafety.manufacturer}
                </div>
                <div className="text-xs text-stone-400 mt-1">
                  {result.foodsafety.foodType}
                </div>
              </div>
              <div className="text-xs text-warning-text bg-warning-soft p-2 rounded">
                ⚠️ 우리 DB에 가격 정보가 없어요. 영수증을 올리면 가격이 등록됩니다.
              </div>
              <div className="flex gap-2 pt-2 border-t border-border">
                <Link href="/upload" className="btn-primary flex-1 text-sm">
                  📸 영수증 올리기
                </Link>
                <button onClick={reset} className="btn-secondary text-sm">
                  다시 스캔
                </button>
              </div>
            </>
          )}

          {!result.found && (
            <>
              <div className="text-center py-4">
                <div className="text-4xl mb-2">🔍</div>
                <h2 className="font-bold mb-1">못 찾았어요</h2>
                <p className="text-sm text-stone-500 mb-2">
                  바코드 <code className="bg-stone-100 px-1.5 py-0.5 rounded">{result.barcode}</code> 의 상품 정보가
                  우리 DB와 식약처 카탈로그에 없습니다.
                </p>
                {result.error && (
                  <p className="text-xs text-danger-text">{result.error}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Link href="/upload" className="btn-primary flex-1 text-sm">
                  📸 영수증으로 등록
                </Link>
                <button onClick={reset} className="btn-secondary text-sm">
                  다시 스캔
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {supported === false && !result && (
        <p className="text-xs text-stone-400 text-center">
          📌 iOS Safari는 바코드 인식 미지원 — 위 입력란에 직접 입력하시거나, Chrome/Edge/삼성인터넷에서 카메라 스캔을 사용하세요.
        </p>
      )}
    </div>
  );
}
