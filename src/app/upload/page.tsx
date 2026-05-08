"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";
import CameraCapture from "@/components/CameraCapture";
import { IconCamera, IconCheck, IconReceipt } from "@/components/icons";

type MatchConfidence = "high" | "medium" | "low";
type MatchMethod =
  | "barcode"
  | "alias_exact"
  | "normalize_exact"
  | "partial"
  | "alias_short"
  | null;

type ParsedItem = {
  rawName: string;
  listPrice: number;                   // 정가
  paidPrice: number | null;            // 행사가 (할인 적용 후 단가)
  promotionType: string | null;        // "할인" | "1+1" | "번들 50%" 등
  barcode: string | null;              // EAN-13 등
  quantity: number;
  productId: string | null;
  confidence: MatchConfidence | null;  // 매칭 신뢰도 — high만 자동 확정
  method: MatchMethod;                 // 매칭 방식 — UI 라벨용
};

type ParseResult = {
  receiptId: string;
  usedMock: boolean;
  source: "clova" | "google_vision" | "mock";
  storeId: string | null;
  storeHint?: string;
  receiptDate?: string;
  totalAmount?: number;
  items: ParsedItem[];
};

type Store = { id: string; name: string; chainName: string };
type Product = { id: string; name: string; brand: string | null };

export default function UploadPage() {
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // 긴 영수증 이어찍기 — 추가 사진 누적 (1번째는 imagePreview, 2번째부터 여기)
  const [extraImages, setExtraImages] = useState<string[]>([]); // dataUrl 배열
  const [cameraOpen, setCameraOpen] = useState(false);
  // "다음 사진 추가 모드" — 카메라가 끝나면 extraImages로 push
  const [addingExtra, setAddingExtra] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<
    | null
    | { kind: "error"; message: string }
    | {
        kind: "success";
        count: number;
        matched: number;
        newProducts: number;
        awarded: boolean;
        awardedPoints: number;
        totalPoints: number | null;
      }
  >(null);

  // 이미지 max 1920px + JPEG 0.85 + EXIF orientation 자동 적용 + 사용자 추가 회전
  // 한국어 OCR은 글씨가 똑바로 서야 인식률 80%↑.
  // 모바일 사진은 EXIF에 회전 메타가 들어가는데 일반 Image()/canvas는 무시 →
  // createImageBitmap의 imageOrientation: 'from-image' 로 자동 적용.
  async function compressDataUrl(
    dataUrl: string,
    rotateDegrees = 0
  ): Promise<string> {
    // dataUrl → blob → ImageBitmap (EXIF 자동 적용)
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      });
    } catch {
      // 일부 구버전 브라우저 fallback
      bitmap = await createImageBitmap(blob);
    }

    // 1280px로 압축 — Vercel body limit(4.5MB) 안전 + OCR이 충분히 인식 가능
    // (영수증 글씨 ~12-18px → 1280에서도 cleartype)
    const maxSize = 1280;
    let w = bitmap.width;
    let h = bitmap.height;
    if (Math.max(w, h) > maxSize) {
      const ratio = maxSize / Math.max(w, h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }

    const rad = (rotateDegrees * Math.PI) / 180;
    const swapped = rotateDegrees % 180 !== 0;
    const canvas = document.createElement("canvas");
    canvas.width = swapped ? h : w;
    canvas.height = swapped ? w : h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return dataUrl;
    }
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.78);
  }

  // 사용자가 회전 버튼 눌렀을 때
  async function rotateImage(degrees: number) {
    if (!imagePreview) return;
    const rotated = await compressDataUrl(imagePreview, degrees).catch(() => imagePreview);
    setImagePreview(rotated);
    setImageBase64(rotated.split(",")[1] ?? null);
  }

  async function handleCameraCapture(dataUrl: string) {
    const compressed = await compressDataUrl(dataUrl).catch(() => dataUrl);
    if (addingExtra && imagePreview) {
      // 이어찍기 — extraImages에 추가
      setExtraImages((prev) => [...prev, compressed]);
      setAddingExtra(false);
    } else {
      // 첫 장 — main image
      setImagePreview(compressed);
      setImageBase64(compressed.split(",")[1] ?? null);
      setExtraImages([]); // 새 영수증 시작 시 extra 초기화
    }
    setCameraOpen(false);
    setResult(null);
    setSubmitResult(null);
  }

  function removeExtraAt(idx: number) {
    setExtraImages((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  }

  async function rotateExtraAt(idx: number, degrees: number) {
    const cur = extraImages[idx];
    if (!cur) return;
    const rotated = await compressDataUrl(cur, degrees).catch(() => cur);
    setExtraImages((prev) => prev.map((x, i) => (i === idx ? rotated : x)));
  }

  async function loadStores() {
    if (stores.length > 0) return;
    const res = await fetch("/api/stores");
    const data = await res.json();
    setStores(data.stores);
  }

  async function loadProducts() {
    if (products.length > 0) return;
    const res = await fetch("/api/products?limit=100");
    const data = await res.json();
    setProducts(data.products);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      const original = reader.result as string;
      // 갤러리 사진은 보통 4-12MB → 압축 필수
      const compressed = await compressDataUrl(original).catch(() => original);
      setImageBase64(compressed.split(",")[1] ?? null);
      setImagePreview(compressed);
    };
    reader.readAsDataURL(file);
  }

  async function parse() {
    setParsing(true);
    setResult(null);
    setSubmitResult(null);
    // 다중 이미지(이어찍기) 지원 — 첫 image + extraImages 합쳐 base64 배열로
    const allImages: string[] = [];
    if (imageBase64) allImages.push(imageBase64);
    for (const dataUrl of extraImages) {
      const b64 = dataUrl.split(",")[1];
      if (b64) allImages.push(b64);
    }
    // 60초 client-side timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          allImages.length > 1
            ? { imagesBase64: allImages }
            : { imageBase64: allImages[0] ?? null }
        ),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errMsg = errBody.hint
          ? `${errBody.error ?? "OCR 실패"}\n${errBody.hint}`
          : errBody.error ?? `OCR 실패 (${res.status})`;
        throw new Error(errMsg);
      }
      const data = await res.json();
      setResult(data);
      setItems(data.items);
      setStoreId(data.storeId ?? "");
      // OCR이 매장을 매칭하지 못했어도(server matchStore=null), 클라이언트 stores 로드 후
      // useEffect에서 storeHint로 부분 매칭 시도 (영수증 매장명으로 자동 dropdown 채움)
      await Promise.all([loadStores(), loadProducts()]);
    } catch (e) {
      clearTimeout(timeoutId);
      const msg =
        e instanceof Error
          ? e.name === "AbortError"
            ? "OCR 응답이 60초를 넘겼어요. 사진 크기를 줄여 다시 시도해 주세요."
            : e.message
          : String(e);
      setSubmitResult({ kind: "error", message: msg });
    } finally {
      setParsing(false);
    }
  }

  // 매장 추측이 있는데 자동 매핑 실패 시 클라이언트에서 부분 매칭 시도
  // server matchStore 강화(분점 번호 제거)와 동일한 로직 — 클라이언트도 같은 동작
  useEffect(() => {
    if (!result?.storeHint || storeId || stores.length === 0) return;
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[()[\]_\-,.]/g, "");
    const looseNormalize = (s: string) =>
      normalize(s)
        .replace(/(\d+)호점/g, "점")
        .replace(/(\d+)점/g, "점");
    const hint = normalize(result.storeHint);
    if (hint.length < 2) return;
    // 1순위: 정규화 후 정확/부분 매칭
    let found = stores.find((s) => {
      const sName = normalize(s.name);
      return sName === hint || sName.includes(hint) || hint.includes(sName);
    });
    // 2순위: 분점 번호 제거 후 매칭 ("천호점" ↔ "천호2점")
    if (!found) {
      const looseHint = looseNormalize(result.storeHint);
      found = stores.find((s) => {
        const sN = looseNormalize(s.name);
        return sN === looseHint || sN.includes(looseHint) || looseHint.includes(sN);
      });
    }
    if (found) setStoreId(found.id);
  }, [result, stores, storeId]);

  async function submit() {
    if (!result || !storeId) return alert("매장을 선택해주세요");
    // 매칭된 항목 + 미매칭 항목(신규 등록) 둘 다 전송
    // - productId 있으면 기존 매칭
    // - productId 없으면 isNew + rawName으로 자동 신규 등록
    const payload = items
      .filter((i) => i.listPrice > 0 && i.rawName.trim())
      .map((i) => ({
        productId: i.productId,
        listPrice: i.listPrice,
        paidPrice: i.paidPrice,
        promotionType: i.promotionType,
        barcode: i.barcode,
        quantity: i.quantity,
        rawName: i.rawName,
        isNew: !i.productId, // 매칭 안 된 거는 신규 등록
      }));
    if (payload.length === 0) return alert("등록할 항목이 없습니다");

    setSubmitting(true);
    const res = await fetch("/api/receipts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiptId: result.receiptId,
        storeId,
        receiptDate: result.receiptDate, // 영수증 거래일 → Price.createdAt
        items: payload,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.ok) {
      setSubmitResult({
        kind: "success",
        count: data.count,
        matched: data.matched,
        newProducts: data.newProducts,
        awarded: !!data.awarded,
        awardedPoints: data.awardedPoints ?? 0,
        totalPoints: data.totalPoints ?? null,
      });
    } else {
      setSubmitResult({ kind: "error", message: data.error ?? "알 수 없는 오류" });
    }
  }

  const matchedCount = items.filter((i) => i.productId).length;
  // 자동 확정 가능한 항목 — confidence "high"만. 사용자가 dropdown 손 안 대도 그대로 등록됨.
  const autoConfirmedCount = items.filter(
    (i) => i.productId && i.confidence === "high",
  ).length;
  // 사용자가 검수해야 하는 항목 — 미매칭 + medium/low confidence
  const needsReviewCount = items.length - autoConfirmedCount;

  // 진행 단계 — 0: 사진 업로드, 1: OCR, 2: 매칭, 3: 등록 완료
  const currentStep = submitResult?.kind === "success"
    ? 3
    : result
      ? 2
      : parsing
        ? 1
        : imagePreview
          ? 1
          : 0;

  return (
    <div className="space-y-6">
      {cameraOpen && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onCancel={() => setCameraOpen(false)}
        />
      )}

      {/* breadcrumb */}
      <nav className="text-xs text-ink-3" aria-label="breadcrumb">
        <Link href="/" className="hover:text-brand-600">
          홈
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-ink-2">영수증 올리기</span>
      </nav>

      <h1 className="text-2xl font-extrabold tracking-tight text-ink-1 inline-flex items-center gap-2">
        <IconReceipt size={24} />
        영수증 올리기
      </h1>

      {/* 진행 단계 인디케이터 */}
      <StepIndicator current={currentStep} />

      {/* OCR/등록 결과 메시지 — result 유무 무관하게 항상 표시 (실패 메시지가 보이게) */}
      {submitResult?.kind === "error" && (
        <div className="bg-danger-soft border border-danger/30 text-danger-text rounded-xl px-4 py-3 text-sm whitespace-pre-line shadow-soft">
          ❌ {submitResult.message}
        </div>
      )}

      <p className="text-ink-2">
        영수증 사진을 올리면 자동으로 품목을 인식해 가격을 등록합니다.
        <br />
        <span className="text-xs text-ink-3">
          (CLOVA OCR 키 미설정 시 데모 데이터로 작동합니다)
        </span>
      </p>

      {/* 큰 카메라 CTA — 화면 중앙, 80% 너비 */}
      {!result && (
        <section className="card p-6 space-y-6">
          <div className="flex flex-col items-center">
            {imagePreview ? (
              // 사진 있으면 미리보기 + 회전 + 다시 찍기/갤러리
              <div className="w-full sm:w-[80%] space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="업로드한 영수증"
                  className="w-full max-h-[60vh] rounded-xl border border-line object-contain bg-surface-muted"
                />
                {/* 회전 가이드 + 버튼 — 누운 영수증 OCR 인식률 0% 회피 */}
                <div className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5 text-amber-800 flex-wrap">
                  <span className="shrink-0">⚠️</span>
                  <span className="flex-1 min-w-[160px]">
                    글씨가 <strong>똑바로 서있게</strong> 보여야 OCR이 정확합니다.
                  </span>
                  {/* 터치 타겟 44x44 이상 — 모바일 손가락 정확도 보장 */}
                  <button
                    type="button"
                    onClick={() => rotateImage(-90)}
                    className="shrink-0 inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-3 py-2 bg-white border border-amber-300 rounded text-amber-900 hover:bg-amber-100 font-semibold text-sm"
                    aria-label="왼쪽으로 90도 회전"
                  >
                    ↶ 90°
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateImage(90)}
                    className="shrink-0 inline-flex items-center justify-center min-w-[44px] min-h-[44px] px-3 py-2 bg-white border border-amber-300 rounded text-amber-900 hover:bg-amber-100 font-semibold text-sm"
                    aria-label="오른쪽으로 90도 회전"
                  >
                    90° ↷
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddingExtra(false);
                      setCameraOpen(true);
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 border border-line-strong rounded-lg text-sm font-medium text-ink-2 hover:bg-surface-muted"
                  >
                    <IconCamera size={16} />
                    다시 찍기
                  </button>
                  <label className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 border border-line-strong rounded-lg text-sm font-medium text-ink-2 hover:bg-surface-muted cursor-pointer">
                    갤러리에서 선택
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        setAddingExtra(false);
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 이어찍기 — 긴 영수증 다음 부분 추가 */}
                <div className="border-t border-line pt-3 mt-1 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-ink-3">
                    <span className="font-medium">📑 이어찍기</span>
                    <span>(긴 영수증은 여러 장으로 나눠 찍어주세요)</span>
                  </div>
                  {extraImages.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {extraImages.map((src, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-lg border border-line overflow-hidden bg-surface-muted"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={src}
                            alt={`이어찍은 ${idx + 2}번째 사진`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-1 left-1 bg-ink-1/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                            #{idx + 2}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeExtraAt(idx)}
                            className="absolute top-1 right-1 w-6 h-6 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-xs leading-none"
                            aria-label="삭제"
                          >
                            ×
                          </button>
                          {/* 모바일 터치 타겟 — 36x36px (추가 사진은 작게 보이지만 회전은 자주 안 누름) */}
                          <div className="absolute bottom-1 right-1 flex gap-1">
                            <button
                              type="button"
                              onClick={() => rotateExtraAt(idx, -90)}
                              className="inline-flex items-center justify-center w-9 h-9 bg-white/90 hover:bg-white text-ink-2 rounded text-base shadow-sm"
                              aria-label="90도 왼쪽 회전"
                            >
                              ↶
                            </button>
                            <button
                              type="button"
                              onClick={() => rotateExtraAt(idx, 90)}
                              className="inline-flex items-center justify-center w-9 h-9 bg-white/90 hover:bg-white text-ink-2 rounded text-base shadow-sm"
                              aria-label="90도 오른쪽 회전"
                            >
                              ↷
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setAddingExtra(true);
                      setCameraOpen(true);
                    }}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 border border-dashed border-line-strong rounded-lg text-sm text-ink-2 hover:bg-surface-muted"
                  >
                    <IconCamera size={16} />
                    {extraImages.length === 0
                      ? "+ 다음 부분 사진 추가"
                      : `+ 사진 더 추가 (${extraImages.length + 1}장째)`}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="w-full sm:w-[80%] flex flex-col items-center gap-3 py-10 border-2 border-dashed border-brand-200 hover:border-brand-400 hover:bg-brand-50 rounded-xl transition-colors text-brand-600"
                  aria-label="카메라로 영수증 촬영"
                >
                  <IconCamera size={64} />
                  <span className="text-base font-bold text-ink-1">
                    카메라로 영수증 찍기
                  </span>
                  <span className="text-xs text-ink-3">탭하여 즉시 촬영</span>
                </button>

                {/* 갤러리 — secondary 링크 */}
                <label className="mt-3 text-xs text-ink-3 hover:text-ink-2 cursor-pointer underline underline-offset-2">
                  또는 갤러리에서 선택하기
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                    aria-label="영수증 사진"
                    className="hidden"
                  />
                </label>
              </>
            )}
          </div>

          <div className="text-xs text-ink-3 text-center">
            이미지를 안 올려도 데모 데이터로 흐름을 확인할 수 있어요.
          </div>

          <button
            onClick={parse}
            disabled={parsing}
            className="w-full bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white px-5 py-3 rounded-xl font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2 shadow-soft hover:shadow-raise transition"
          >
            {parsing && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" />
              </svg>
            )}
            {parsing ? "OCR 처리 중... (5~10초)" : "OCR 시작"}
          </button>

          {/* 가치 제안 — 왜 영수증을 올리나요? */}
          <div className="pt-4 border-t border-line">
            <h3 className="text-sm font-bold text-ink-1 mb-3">
              왜 영수증을 올리나요?
            </h3>
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2.5">
                <span className="shrink-0 text-emerald-600 mt-0.5">
                  <IconCheck size={18} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-1">이웃 절약</div>
                  <div className="text-xs text-ink-3">
                    내가 올린 가격이 동네 이웃의 장보기를 도와줘요.
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="shrink-0 text-emerald-600 mt-0.5">
                  <IconCheck size={18} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-1">데이터 누적</div>
                  <div className="text-xs text-ink-3">
                    실제 영수증이 쌓일수록 비교 정확도가 높아져요.
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="shrink-0 text-emerald-600 mt-0.5">
                  <IconCheck size={18} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink-1">0원 비용</div>
                  <div className="text-xs text-ink-3">
                    완전 무료 · 광고 없음. 포인트도 자동 적립.
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>
      )}

      {result && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 왼쪽 — 이미지 미리보기 */}
          <div className="card p-4">
            <h2 className="section-title mb-3 text-sm">영수증 이미지</h2>
            {imagePreview ? (
              // 단순 img 태그 — Next/Image 안 씀 (data URL이라 외부 도메인 설정 불필요)
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="영수증 미리보기"
                className="w-full rounded-md border border-line object-contain max-h-[640px]"
              />
            ) : (
              <div className="aspect-[3/4] bg-surface-muted border border-dashed border-line rounded-md flex items-center justify-center text-sm text-ink-3">
                이미지 미리보기가 여기 표시됩니다
                <br />
                (데모 모드는 이미지 없음)
              </div>
            )}
          </div>

          {/* 오른쪽 — OCR 결과 */}
          <div className="card p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-bold text-ink-1">파싱 결과</h2>
              <span className={`text-xs px-2 py-0.5 rounded ${
                result.source === "clova" ? "bg-emerald-100 text-emerald-700"
                : result.source === "google_vision" ? "bg-blue-100 text-blue-700"
                : "bg-amber-100 text-amber-700"
              }`}>
                {result.source === "clova" ? "🟢 CLOVA OCR"
                : result.source === "google_vision" ? "🔵 Google Vision"
                : "⚠️ Mock OCR"}
              </span>
            </div>

            {/* 상단 강조 카드 — storeHint, receiptDate, totalAmount */}
            <div className="grid grid-cols-3 gap-2">
              <SummaryCard
                label="매장 추측"
                value={result.storeHint ?? "—"}
              />
              <SummaryCard
                label="영수증 일자"
                value={result.receiptDate ?? "—"}
              />
              <SummaryCard
                label="합계"
                value={result.totalAmount ? formatWon(result.totalAmount) : "—"}
                highlight
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-ink-1">매장 확인</label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full px-3 py-2 border border-line-strong rounded-md"
              >
                <option value="">매장 선택...</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.chainName} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-ink-1">
                품목 처리
              </label>
              {/* 자동 확정 vs 검수 필요 한눈에 — 사용자 클릭 부담 시각화 */}
              <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full px-2.5 py-1">
                  ✓ 자동 매칭 <strong className="tabular-nums">{autoConfirmedCount}</strong>건
                </span>
                {needsReviewCount > 0 && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-2.5 py-1">
                    ✋ 확인 필요 <strong className="tabular-nums">{needsReviewCount}</strong>건
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-3 mb-2">
                {autoConfirmedCount > 0 && needsReviewCount === 0
                  ? "전부 자동 매칭됐어요. 그대로 \"가격 등록\" 누르면 끝!"
                  : needsReviewCount > 0
                    ? "노란색 항목만 한 번 확인해 주세요. 초록색은 그대로 등록됩니다."
                    : "매칭 안 된 항목은 영수증 이름 그대로 새 상품으로 등록돼요."}
              </p>
              <div className="space-y-2">
                {items.map((it, idx) => {
                  const ok = !!it.productId;
                  // 자동 확정: high confidence 매칭 → 회색·연한 emerald 톤, dropdown 작게
                  // 검수 필요: medium/low/null → 노란색 강조
                  const isAutoConfirmed = ok && it.confidence === "high";
                  const tone = isAutoConfirmed
                    ? "bg-emerald-50/40 border-emerald-200"
                    : ok && (it.confidence === "medium" || it.confidence === "low")
                      ? "bg-amber-50 border-amber-300"
                      : "bg-amber-50/40 border-amber-200";
                  const methodLabel = methodToLabel(it.method, it.confidence);
                  return (
                    <div
                      key={idx}
                      className={`rounded-md p-2 border text-sm ${tone}`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="shrink-0 mt-0.5"
                          aria-label={isAutoConfirmed ? "자동 매칭" : ok ? "검수 필요" : "신규 등록"}
                          title={methodLabel ?? ""}
                        >
                          {isAutoConfirmed ? (
                            <span className="text-emerald-600">✓</span>
                          ) : ok ? (
                            <span className="text-amber-600">⚠️</span>
                          ) : (
                            <span className="text-amber-600">🆕</span>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-ink-2 break-words text-xs mb-1 flex items-center gap-1.5 flex-wrap">
                            <span className="text-ink-3">
                              {ok ? "원본: " : "신규 등록될 이름: "}
                            </span>
                            <span className={ok ? "" : "font-medium text-ink-1"}>
                              {it.rawName}
                            </span>
                            {methodLabel && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                isAutoConfirmed
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-800"
                              }`}>
                                {methodLabel}
                              </span>
                            )}
                          </div>
                          <select
                            value={it.productId ?? ""}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = {
                                ...it,
                                productId: e.target.value || null,
                                // 사용자가 직접 골랐으면 confidence를 high로 격상 (수동 확정)
                                confidence: e.target.value ? "high" : null,
                              };
                              setItems(next);
                            }}
                            aria-label="상품 매칭"
                            className={`w-full px-2 py-1.5 border-2 rounded text-xs font-medium ${
                              isAutoConfirmed
                                ? "border-emerald-400 bg-emerald-50 text-emerald-900"
                                : "border-amber-400 bg-amber-50 text-amber-900"
                            }`}
                          >
                            {ok && it.productId && (
                              <option value={it.productId}>
                                {isAutoConfirmed
                                  ? "✓ 자동 매칭된 상품 — 그대로 등록"
                                  : "⚠️ 일치 의심 — 확인 후 등록"}
                              </option>
                            )}
                            <option value="">
                              {ok
                                ? "🔍 다른 상품으로 변경 또는 신규 등록"
                                : "🆕 신규 상품으로 등록"}
                            </option>
                            {products
                              .filter((p) => p.id !== it.productId)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                          </select>
                          <div className="flex justify-between items-end mt-1 text-xs">
                            <div className="text-ink-3 space-y-0.5">
                              <div>x{it.quantity}</div>
                              {it.barcode && (
                                <div className="font-mono text-[10px]" title="바코드 (EAN-13)">
                                  📦 {it.barcode}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              {it.paidPrice != null && it.paidPrice < it.listPrice ? (
                                <>
                                  <div className="text-[10px] text-ink-3 line-through tabular-nums">
                                    {formatWon(it.listPrice)}
                                  </div>
                                  <div className="font-semibold tabular-nums text-rose-600">
                                    {formatWon(it.paidPrice)}
                                  </div>
                                  {it.promotionType && (
                                    <div className="text-[10px] text-rose-500">
                                      {it.promotionType}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="font-semibold tabular-nums text-ink-1">
                                  {formatWon(it.listPrice)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {!storeId && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-center gap-2">
                <span aria-hidden>⚠️</span>
                <span>
                  매장을 먼저 선택해주세요.
                  {result.storeHint && (
                    <>
                      {" "}
                      <span className="text-ink-3">
                        영수증 매장: <strong className="text-ink-2">{result.storeHint}</strong>
                        {" — "}
                        목록에 없으면 가장 가까운 매장을 선택하세요.
                      </span>
                    </>
                  )}
                </span>
              </div>
            )}
            <button
              onClick={submit}
              disabled={submitting || !storeId}
              className="w-full bg-gradient-to-br from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white py-3 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-soft hover:shadow-raise transition"
            >
              {submitting
                ? "등록 중..."
                : needsReviewCount === 0 && autoConfirmedCount > 0
                  ? `✓ 자동 매칭 ${autoConfirmedCount}건 그대로 등록`
                  : `✓ ${items.length}건 등록 (자동 ${autoConfirmedCount} · 검수 ${needsReviewCount})`}
            </button>

            {submitResult?.kind === "success" && (
              <RewardPanel result={submitResult} />
            )}
            {submitResult?.kind === "error" && (
              <div className="text-center text-sm pt-2 text-rose-600">
                ❌ {submitResult.message}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  const steps = [
    { label: "사진 업로드", icon: "📷" },
    { label: "OCR 인식", icon: "🔍" },
    { label: "품목 매칭", icon: "🔗" },
    { label: "등록 완료", icon: "✅" },
  ];
  return (
    <ol
      className="flex items-center gap-1 md:gap-2 text-[11px] md:text-xs"
      aria-label="진행 단계"
    >
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} className="flex items-center gap-1 md:gap-2 flex-1">
            <div
              className={`flex flex-col items-center gap-0.5 flex-1 min-w-0 ${
                done
                  ? "text-emerald-700"
                  : active
                    ? "text-brand-700"
                    : "text-ink-3"
              }`}
            >
              <span
                className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center border ${
                  done
                    ? "bg-emerald-50 border-emerald-300"
                    : active
                      ? "bg-brand-50 border-brand-400"
                      : "bg-surface-muted border-line"
                }`}
                aria-hidden
              >
                {done ? "✓" : s.icon}
              </span>
              <span className="text-center truncate w-full font-medium">
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={`shrink-0 w-2 md:w-4 h-px ${
                  done ? "bg-emerald-300" : "bg-line"
                }`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// 영수증 등록 직후 보상 패널 — 한국 4060의 즉각 보상 심리 자극용
// 단순 텍스트보다 큰 +점수 + 누적 + 다음 마일스톤 진행바
function RewardPanel({
  result,
}: {
  result: {
    count: number;
    matched: number;
    newProducts: number;
    awarded: boolean;
    awardedPoints: number;
    totalPoints: number | null;
  };
}) {
  // 마일스톤: 10(혜택 모듈 열림) → 50 → 100 → 500
  const MILESTONES = [10, 50, 100, 500, 1000];
  const total = result.totalPoints ?? 0;
  const next = MILESTONES.find((m) => m > total) ?? null;
  const prev = [...MILESTONES].reverse().find((m) => m <= total) ?? 0;
  const progressPct = next
    ? Math.round(((total - prev) / (next - prev)) * 100)
    : 100;

  if (!result.awarded) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
        <div className="text-2xl mb-1">✅</div>
        <div className="font-bold text-ink-1 mb-1">
          {result.count}건 등록 완료
        </div>
        <div className="text-xs text-ink-3 mb-3">
          {result.matched}건 매칭 + {result.newProducts}건 신규 등록
        </div>
        <div className="text-sm text-amber-800 bg-white rounded-lg p-3 border border-amber-200">
          로그인하면 영수증 1장당 <strong>2~10점</strong>이 적립돼요.
          <br />
          포인트 10점 모이면 <strong>정부 혜택 추천</strong>도 열립니다.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-brand-50 to-amber-50 border border-brand-200 rounded-xl p-5 space-y-4">
      {/* 큰 +N점 — 보상 강조 */}
      <div className="text-center">
        <div className="text-xs font-medium text-brand-700 mb-1">
          ✨ 등록 완료 · 포인트 적립
        </div>
        <div className="text-5xl font-extrabold text-brand-600 tabular-nums leading-none mb-1">
          +{result.awardedPoints}
        </div>
        <div className="text-xs text-ink-3">
          {result.matched}건 매칭(+{result.matched * 2}) ·{" "}
          {result.newProducts}건 신규(+{result.newProducts * 5})
        </div>
      </div>

      {/* 누적 + 다음 마일스톤 */}
      <div className="bg-white rounded-lg p-4 border border-brand-100">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm text-ink-2">누적 포인트</span>
          <span className="text-2xl font-bold text-ink-1 tabular-nums">
            {total.toLocaleString("ko-KR")}점
          </span>
        </div>
        {next ? (
          <>
            <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden mb-1.5">
              <div
                className="bg-gradient-to-r from-brand-400 to-brand-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.max(2, progressPct)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-ink-3">
              <span>다음 단계까지 {next - total}점</span>
              <span className="font-medium tabular-nums">{next}점</span>
            </div>
            {next === 10 && (
              <div className="text-[11px] text-brand-700 mt-2 font-medium">
                💡 10점 달성 시 <Link href="/benefits" className="underline">정부 혜택 추천</Link>이 열려요
              </div>
            )}
          </>
        ) : (
          <div className="text-[11px] text-emerald-700 font-medium">
            🏆 모든 마일스톤 달성! 데이터 기여 마스터예요.
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Link
          href="/upload"
          onClick={() => {
            // 동일 페이지 이동 — 새로 시작
            window.location.reload();
          }}
          className="flex-1 text-center bg-white border border-brand-300 hover:border-brand-500 text-brand-700 py-2.5 rounded-lg text-sm font-semibold"
        >
          영수증 더 올리기
        </Link>
        <Link
          href="/profile"
          className="flex-1 text-center bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-semibold"
        >
          내 포인트 보기 →
        </Link>
      </div>
    </div>
  );
}

// 매칭 방법을 사용자가 알아볼 수 있는 짧은 라벨로 변환
function methodToLabel(method: MatchMethod, confidence: MatchConfidence | null): string | null {
  if (!method) return null;
  switch (method) {
    case "barcode":
      return "📦 바코드";
    case "alias_exact":
    case "alias_short":
      return "별칭 일치";
    case "normalize_exact":
      return "이름 일치";
    case "partial":
      return confidence === "high"
        ? "이름 95% 일치"
        : confidence === "medium"
          ? "이름 75% 일치 — 확인"
          : "이름 65% 일치 — 의심";
    default:
      return null;
  }
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md p-2 ${
        highlight ? "bg-brand-50 border border-brand-200" : "bg-surface-muted border border-line"
      }`}
    >
      <div className="text-[10px] text-ink-3">{label}</div>
      <div
        className={`text-sm font-semibold truncate ${
          highlight ? "text-brand-700" : "text-ink-1"
        }`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
