"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";
import CameraCapture from "@/components/CameraCapture";
import {
  Button,
  Badge,
  Card,
  Caption,
  ConfChip,
  Num,
  Progress,
  CameraIcon,
  CheckIcon,
  WarnIcon,
  SparkleIcon,
  PlusIcon,
  ReceiptIcon,
  ChevronIcon,
  type Conf,
} from "@/components/ui";

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
  listPrice: number;
  paidPrice: number | null;
  promotionType: string | null;
  barcode: string | null;
  quantity: number;
  productId: string | null;
  confidence: MatchConfidence | null;
  method: MatchMethod;
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

// 매칭 신뢰도 → ConfChip의 3단계로 매핑.
function confOf(it: ParsedItem): Conf {
  if (!it.productId) return "new";
  return it.confidence === "high" ? "auto" : "review";
}

export default function UploadPage() {
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extraImages, setExtraImages] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
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

  // 이미지 max 1280px + JPEG 0.78 + EXIF orientation 자동 적용 + 사용자 추가 회전.
  // 한국어 OCR은 글씨가 똑바로 서야 인식률 80%↑.
  async function compressDataUrl(dataUrl: string, rotateDegrees = 0): Promise<string> {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      bitmap = await createImageBitmap(blob);
    }
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

  async function rotateImage(degrees: number) {
    if (!imagePreview) return;
    const rotated = await compressDataUrl(imagePreview, degrees).catch(() => imagePreview);
    setImagePreview(rotated);
    setImageBase64(rotated.split(",")[1] ?? null);
  }

  async function handleCameraCapture(dataUrl: string) {
    const compressed = await compressDataUrl(dataUrl).catch(() => dataUrl);
    if (addingExtra && imagePreview) {
      setExtraImages((prev) => [...prev, compressed]);
      setAddingExtra(false);
    } else {
      setImagePreview(compressed);
      setImageBase64(compressed.split(",")[1] ?? null);
      setExtraImages([]);
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
    const allImages: string[] = [];
    if (imageBase64) allImages.push(imageBase64);
    for (const dataUrl of extraImages) {
      const b64 = dataUrl.split(",")[1];
      if (b64) allImages.push(b64);
    }
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

  // 매장 추측 자동 매핑 — 분점 번호 제거 후 부분 매칭.
  useEffect(() => {
    if (!result?.storeHint || storeId || stores.length === 0) return;
    const normalize = (s: string) =>
      s.toLowerCase().replace(/\s+/g, "").replace(/[()[\]_\-,.]/g, "");
    const looseNormalize = (s: string) =>
      normalize(s).replace(/(\d+)호점/g, "점").replace(/(\d+)점/g, "점");
    const hint = normalize(result.storeHint);
    if (hint.length < 2) return;
    let found = stores.find((s) => {
      const sName = normalize(s.name);
      return sName === hint || sName.includes(hint) || hint.includes(sName);
    });
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
        isNew: !i.productId,
      }));
    if (payload.length === 0) return alert("등록할 항목이 없습니다");

    setSubmitting(true);
    const res = await fetch("/api/receipts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiptId: result.receiptId,
        storeId,
        receiptDate: result.receiptDate,
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

  const autoCount = items.filter((i) => i.productId && i.confidence === "high").length;
  const reviewCount = items.filter(
    (i) => i.productId && (i.confidence === "medium" || i.confidence === "low"),
  ).length;
  const newCount = items.filter((i) => !i.productId).length;
  const needsReviewCount = items.length - autoCount;

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
        <Link href="/" className="hover:text-brand-600">홈</Link>
        <span className="mx-1.5">/</span>
        <span className="text-ink-2">영수증 올리기</span>
      </nav>

      {/* 헤더 */}
      <header>
        <Caption>{result ? `${items.length}품목 검수` : "영수증 OCR"}</Caption>
        <h1 className="mt-1.5 text-[26px] md:text-[30px] font-extrabold tracking-[-0.6px] text-ink-1 inline-flex items-center gap-2">
          <ReceiptIcon size={24} />
          {result ? "영수증 검수" : "영수증 올리기"}
        </h1>
      </header>

      {/* 진행 단계 인디케이터 */}
      <StepIndicator current={currentStep} />

      {submitResult?.kind === "error" && (
        <div className="bg-danger-soft border border-danger/30 text-danger-text rounded-2xl px-4 py-3 text-sm whitespace-pre-line shadow-soft">
          {submitResult.message}
        </div>
      )}

      {!result && (
        <Card className="p-6 space-y-6">
          <div className="flex flex-col items-center">
            {imagePreview ? (
              <div className="w-full sm:w-[80%] space-y-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="업로드한 영수증"
                  className="w-full max-h-[60vh] rounded-2xl border border-line object-contain bg-surface-muted"
                />
                {/* 회전 가이드 */}
                <div className="flex items-center gap-2 text-sm bg-warning-soft border border-warning/30 rounded-xl px-3 py-2.5 text-warning-text flex-wrap">
                  <WarnIcon size={16} className="shrink-0" />
                  <span className="flex-1 min-w-[160px]">
                    글씨가 <strong>똑바로 서있게</strong> 보여야 OCR이 정확합니다.
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => rotateImage(-90)}
                    aria-label="왼쪽으로 90도 회전"
                  >
                    ↶ 90°
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => rotateImage(90)}
                    aria-label="오른쪽으로 90도 회전"
                  >
                    90° ↷
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    fullWidth
                    variant="secondary"
                    icon={<CameraIcon size={16} />}
                    onClick={() => {
                      setAddingExtra(false);
                      setCameraOpen(true);
                    }}
                  >
                    다시 찍기
                  </Button>
                  <label className="flex-1 inline-flex items-center justify-center gap-2 min-h-[44px] py-2.5 border border-line-strong bg-surface rounded-xl text-sm font-semibold text-ink-1 hover:bg-surface-muted cursor-pointer transition">
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

                {/* 이어찍기 카드 — 시안 디자인 그대로 */}
                <Card className="p-3 flex gap-3 items-center">
                  <div
                    className="w-[60px] h-[78px] rounded-lg border border-line shrink-0"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(180deg, var(--surface-muted) 0 6px, var(--line) 6px 7px)",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink-1">긴 영수증이에요?</div>
                    <div className="text-xs text-ink-3 mt-0.5 leading-snug">
                      아래쪽이 잘렸으면<br />이어서 한 장 더 찍을 수 있어요
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="soft"
                    icon={<PlusIcon size={14} />}
                    onClick={() => {
                      setAddingExtra(true);
                      setCameraOpen(true);
                    }}
                  >
                    이어찍기
                  </Button>
                </Card>

                {extraImages.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {extraImages.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-xl border border-line overflow-hidden bg-surface-muted"
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
                          className="absolute top-1 right-1 w-6 h-6 bg-danger hover:opacity-90 text-white rounded-full text-xs leading-none"
                          aria-label="삭제"
                        >
                          ×
                        </button>
                        <div className="absolute bottom-1 right-1 flex gap-1">
                          <button
                            type="button"
                            onClick={() => rotateExtraAt(idx, -90)}
                            className="inline-flex items-center justify-center w-9 h-9 bg-surface/90 hover:bg-surface text-ink-2 rounded text-base shadow-soft"
                            aria-label="90도 왼쪽 회전"
                          >
                            ↶
                          </button>
                          <button
                            type="button"
                            onClick={() => rotateExtraAt(idx, 90)}
                            className="inline-flex items-center justify-center w-9 h-9 bg-surface/90 hover:bg-surface text-ink-2 rounded text-base shadow-soft"
                            aria-label="90도 오른쪽 회전"
                          >
                            ↷
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setCameraOpen(true)}
                  className="w-full sm:w-[80%] flex flex-col items-center gap-3 py-10 border-2 border-dashed border-line-strong hover:border-brand-400 hover:bg-brand-soft rounded-2xl transition-colors text-brand-500"
                  aria-label="카메라로 영수증 촬영"
                >
                  <CameraIcon size={64} />
                  <span className="text-base font-bold text-ink-1">
                    카메라로 영수증 찍기
                  </span>
                  <span className="text-xs text-ink-3">탭하여 즉시 촬영</span>
                </button>

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

          <Button
            fullWidth
            size="lg"
            variant="primary"
            disabled={parsing}
            onClick={parse}
            icon={
              parsing ? (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                  <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" />
                </svg>
              ) : null
            }
          >
            {parsing ? "OCR 처리 중... (5~10초)" : "OCR 시작"}
          </Button>

          {/* 가치 제안 */}
          <div className="pt-4 border-t border-line">
            <h3 className="text-sm font-bold text-ink-1 mb-3">왜 영수증을 올리나요?</h3>
            <ul className="space-y-2.5">
              {[
                ["이웃 절약", "내가 올린 가격이 동네 이웃의 장보기를 도와줘요."],
                ["데이터 누적", "실제 영수증이 쌓일수록 비교 정확도가 높아져요."],
                ["0원 비용", "완전 무료 · 광고 없음. 포인트도 자동 적립."],
              ].map(([title, body]) => (
                <li key={title} className="flex items-start gap-2.5">
                  <span className="shrink-0 text-success mt-0.5">
                    <CheckIcon size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-ink-1">{title}</div>
                    <div className="text-xs text-ink-3">{body}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {result && (
        <section className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-5">
          <div className="space-y-4">
            {/* 신뢰도 요약 칩 */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone="success" icon={<CheckIcon size={11} />}>
                자동확정 {autoCount}건
              </Badge>
              {reviewCount > 0 && (
                <Badge tone="warning" icon={<WarnIcon size={11} />}>
                  검수 필요 {reviewCount}건
                </Badge>
              )}
              {newCount > 0 && (
                <Badge tone="info" icon={<SparkleIcon size={11} />}>
                  신규 {newCount}건
                </Badge>
              )}
              <span className="ml-auto">
                <Badge tone={
                  result.source === "clova" ? "success"
                  : result.source === "google_vision" ? "info"
                  : "warning"
                }>
                  {result.source === "clova" ? "CLOVA OCR"
                  : result.source === "google_vision" ? "Google Vision"
                  : "Mock OCR"}
                </Badge>
              </span>
            </div>

            {/* 요약 카드 3개 — 모바일은 매장 추측을 풀폭(긴 매장명 잘림 방지) + 일자/합계 2-col */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="col-span-2 sm:col-span-1">
                <SummaryCard label="매장 추측" value={result.storeHint ?? "—"} />
              </div>
              <SummaryCard label="영수증 일자" value={result.receiptDate ?? "—"} />
              <SummaryCard
                label="합계"
                value={result.totalAmount ? formatWon(result.totalAmount) : "—"}
                highlight
              />
            </div>

            {/* 매장 선택 */}
            <Card className="p-4">
              <Caption>매장 확인</Caption>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="mt-2 w-full px-3 h-11 border border-line-strong rounded-xl bg-surface text-ink-1 text-sm font-medium"
              >
                <option value="">매장 선택...</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.chainName} - {s.name}
                  </option>
                ))}
              </select>
              {!storeId && result.storeHint && (
                <div className="mt-2 text-xs text-ink-3">
                  영수증 매장: <strong className="text-ink-1">{result.storeHint}</strong>
                  {" — "}목록에 없으면 가장 가까운 매장을 선택하세요.
                </div>
              )}
            </Card>

            {/* 자동확정 vs 검수 안내 */}
            <p className="text-xs text-ink-3">
              {autoCount > 0 && needsReviewCount === 0
                ? "전부 자동 매칭됐어요. 그대로 \"검수 완료\" 누르면 끝!"
                : needsReviewCount > 0
                  ? "노란/파랑 항목만 한 번 확인해 주세요. 초록색은 그대로 등록됩니다."
                  : "매칭 안 된 항목은 영수증 이름 그대로 새 상품으로 등록돼요."}
            </p>

            {/* 아이템 리스트 — 신뢰도 좌측 색 띠 + ConfChip */}
            <Card className="p-0">
              {items.map((it, idx) => (
                <ReceiptRow
                  key={idx}
                  item={it}
                  products={products}
                  onChange={(next) => {
                    const arr = [...items];
                    arr[idx] = next;
                    setItems(arr);
                  }}
                  onRemove={() => {
                    setItems((prev) => prev.filter((_, i) => i !== idx));
                  }}
                />
              ))}
              {items.length === 0 && (
                <div className="px-4 py-6 text-center text-xs text-ink-3">
                  품목을 전부 삭제했어요. 사진을 다시 찍거나 OCR을 다시 돌려주세요.
                </div>
              )}
            </Card>

            {/* 액션 버튼 */}
            <div className="flex justify-end gap-2 flex-wrap">
              <Button variant="secondary" disabled={submitting} onClick={() => window.location.reload()}>
                취소
              </Button>
              <Button
                variant="primary"
                size="lg"
                disabled={submitting || !storeId}
                onClick={submit}
              >
                {submitting
                  ? "등록 중..."
                  : needsReviewCount === 0
                    ? `자동 매칭 ${autoCount}건 그대로 등록`
                    : `${items.length}건 검수 완료 · 등록`}
              </Button>
            </div>
          </div>

          {/* 사이드 — 적립 시뮬레이션 + 영수증 이미지 */}
          <aside className="space-y-4">
            <RewardPanel
              autoCount={autoCount}
              reviewCount={reviewCount}
              newCount={newCount}
              result={submitResult?.kind === "success" ? submitResult : null}
            />

            {imagePreview && (
              <Card className="p-3">
                <Caption>원본 이미지</Caption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imagePreview}
                  alt="영수증 미리보기"
                  className="mt-2 w-full rounded-xl border border-line object-contain max-h-[480px]"
                />
              </Card>
            )}
          </aside>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ReceiptRow — 신뢰도 좌측 색 띠 + ConfChip + 매칭 dropdown
// ─────────────────────────────────────────────────────────────
function ReceiptRow({
  item,
  products,
  onChange,
  onRemove,
}: {
  item: ParsedItem;
  products: Product[];
  onChange: (next: ParsedItem) => void;
  onRemove: () => void;
}) {
  const conf = confOf(item);
  // 자동확정은 시각적으로 조용하게(좌측 띠 X, 배경 X).
  // 검수/신규만 좌측 색 띠 + 옅은 배경 강조.
  const isAuto = conf === "auto";
  const stripColor = conf === "review" ? "var(--warning)" : conf === "new" ? "var(--info)" : "transparent";
  const bgClass = isAuto ? "" : conf === "review" ? "bg-warning-soft/30" : "bg-info-soft/30";

  const methodLabel = methodToLabel(item.method, item.confidence);
  const showSuggest = conf !== "auto";

  return (
    <div className={["relative px-4 py-3.5 border-b border-line last:border-b-0", bgClass].join(" ")}>
      {!isAuto && (
        <span
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: stripColor }}
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`품목 삭제: ${item.rawName}`}
        title="이 품목 삭제 (OCR이 잘못 잡았을 때)"
        className="absolute top-2 right-2 w-7 h-7 inline-flex items-center justify-center rounded-full text-ink-3 hover:text-danger hover:bg-danger-soft transition text-base leading-none"
      >
        ×
      </button>
      <div className="flex items-start gap-2.5 pr-8">
        <div className="pt-0.5">
          <ConfChip conf={conf} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-ink-3">
            <span>{isAuto ? "매칭" : conf === "review" ? "확인" : "신규"}:</span>
            <span className={isAuto ? "text-ink-2" : "text-ink-1 font-semibold"}>
              {item.rawName}
            </span>
            {methodLabel && (
              <Badge tone={isAuto ? "success" : "warning"} className="ml-1">
                {methodLabel}
              </Badge>
            )}
          </div>
          {showSuggest && (
            <select
              value={item.productId ?? ""}
              onChange={(e) =>
                onChange({
                  ...item,
                  productId: e.target.value || null,
                  confidence: e.target.value ? "high" : null,
                })
              }
              aria-label="상품 매칭"
              className={[
                "mt-2 w-full px-2.5 py-2 border-2 rounded-lg text-[13px] font-medium",
                conf === "review"
                  ? "border-warning bg-warning-soft text-warning-text"
                  : "border-info bg-info-soft text-info-text",
              ].join(" ")}
            >
              {item.productId && (
                <option value={item.productId}>
                  {conf === "review" ? "일치 의심 — 확인 후 등록" : "선택된 상품"}
                </option>
              )}
              <option value="">
                {item.productId ? "다른 상품으로 변경 또는 신규" : "신규 상품으로 등록"}
              </option>
              {products
                .filter((p) => p.id !== item.productId)
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
            </select>
          )}
          <div className="mt-2 flex justify-between items-end text-xs">
            <div className="text-ink-3 space-y-0.5">
              <div>x{item.quantity}</div>
              {item.barcode && (
                <div className="font-mono text-[10px]" title="바코드 (EAN-13)">
                  {item.barcode}
                </div>
              )}
            </div>
            <div className="text-right">
              {item.paidPrice != null && item.paidPrice < item.listPrice ? (
                <>
                  <div className="text-[10px] text-ink-3 line-through tabular-nums">
                    {formatWon(item.listPrice)}
                  </div>
                  <div className="font-semibold tabular-nums text-danger">
                    {formatWon(item.paidPrice)}
                  </div>
                  {item.promotionType && (
                    <div className="text-[10px] text-danger">{item.promotionType}</div>
                  )}
                </>
              ) : (
                <Num value={item.listPrice} size={14} weight={700} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RewardPanel — 적립 시뮬레이션 / 등록 완료 후 보상
// ─────────────────────────────────────────────────────────────
function RewardPanel({
  autoCount,
  reviewCount,
  newCount,
  result,
}: {
  autoCount: number;
  reviewCount: number;
  newCount: number;
  result: {
    count: number;
    matched: number;
    newProducts: number;
    awarded: boolean;
    awardedPoints: number;
    totalPoints: number | null;
  } | null;
}) {
  // 등록 전: 예상 시뮬레이션
  if (!result) {
    const estPoints = autoCount * 1 + reviewCount * 1 + newCount * 2;
    const total = estPoints;
    return (
      <Card raised className="p-5">
        <Caption>적립 시뮬레이션</Caption>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className="text-[44px] font-extrabold leading-none tabular-nums"
            style={{ color: "var(--brand)" }}
          >
            +{total}
          </span>
          <span className="text-base text-ink-3">포인트</span>
        </div>
        <div className="mt-4 space-y-1 text-[13px] border-t border-dashed border-line pt-3">
          <Row label={`자동확정 ${autoCount}건`} value={`+${autoCount}p`} />
          <Row label={`검수 통과 (예상) ${reviewCount}건`} value={`+${reviewCount}p`} />
          <Row label={`신규 등록 (예상) ${newCount}건`} value={`+${newCount * 2}p`} />
        </div>
      </Card>
    );
  }

  if (!result.awarded) {
    return (
      <Card className="p-5 bg-warning-soft border border-warning/30">
        <div className="text-2xl mb-1">✅</div>
        <div className="font-bold text-ink-1 mb-1">{result.count}건 등록 완료</div>
        <div className="text-xs text-ink-3 mb-3">
          {result.matched}건 매칭 + {result.newProducts}건 신규
        </div>
        <div className="text-sm text-warning-text bg-surface rounded-lg p-3 border border-line">
          로그인하면 영수증 1장당 <strong>2~10점</strong>이 적립돼요.
          <br />
          포인트 10점 모이면 <strong>정부 혜택 추천</strong>도 열립니다.
        </div>
      </Card>
    );
  }

  const MILESTONES = [10, 50, 100, 500, 1000];
  const total = result.totalPoints ?? 0;
  const next = MILESTONES.find((m) => m > total) ?? null;
  const prev = [...MILESTONES].reverse().find((m) => m <= total) ?? 0;
  const progressPct = next ? Math.round(((total - prev) / (next - prev)) * 100) : 100;

  return (
    <Card
      raised
      className="p-5"
      style={{
        background: "linear-gradient(135deg, var(--brand-soft) 0%, var(--surface) 100%)",
      }}
    >
      <Caption>등록 완료 · 포인트 적립</Caption>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="text-[56px] font-extrabold leading-none tabular-nums tracking-[-2px]"
          style={{ color: "var(--brand)" }}
        >
          +{result.awardedPoints}
        </span>
        <span className="text-base text-ink-3">p</span>
      </div>
      <div className="mt-2 text-xs text-ink-3">
        매칭 {result.matched} · 신규 {result.newProducts}
      </div>

      <div className="mt-4 border-t border-dashed border-line pt-4">
        <Caption>누적 포인트</Caption>
        <div className="mt-1 flex items-baseline justify-between">
          <Num value={total} currency="" size={26} weight={800} />
          {next && <span className="text-xs text-ink-3">다음 {next}p</span>}
        </div>
        {next && (
          <div className="mt-2">
            <Progress value={Math.max(2, progressPct)} tone="brand" height={6} />
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-3 tabular-nums">
              <span>다음 단계까지 {next - total}점</span>
              <span className="font-semibold">{next}점</span>
            </div>
            {next === 10 && (
              <div className="text-[11px] text-brand-ink mt-2 font-semibold">
                💡 10점 달성 시 <Link href="/benefits" className="underline">정부 혜택 추천</Link>이 열려요
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          fullWidth
          variant="secondary"
          onClick={() => window.location.reload()}
        >
          영수증 더 올리기
        </Button>
        <Link
          href="/profile"
          className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm gap-1.5"
        >
          내 포인트
          <ChevronIcon size={14} />
        </Link>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-ink-2">
      <span>{label}</span>
      <span className="tabular-nums font-semibold text-ink-1">{value}</span>
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
    <ol className="flex items-center gap-1 md:gap-2 text-[11px] md:text-xs" aria-label="진행 단계">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} className="flex items-center gap-1 md:gap-2 flex-1">
            <div
              className={`flex flex-col items-center gap-0.5 flex-1 min-w-0 ${
                done ? "text-success-text" : active ? "text-brand-ink" : "text-ink-3"
              }`}
            >
              <span
                className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center border ${
                  done
                    ? "bg-success-soft border-success/30"
                    : active
                      ? "bg-brand-soft border-brand-500"
                      : "bg-surface-muted border-line"
                }`}
                aria-hidden
              >
                {done ? "✓" : s.icon}
              </span>
              {/* 모바일: 활성 step 라벨만 표시(다른 건 잘림). sm↑: 모든 라벨 노출 */}
              <span
                className={`text-center truncate w-full font-medium ${
                  active ? "inline-block" : "hidden sm:inline-block"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={`shrink-0 w-2 md:w-4 h-px ${done ? "bg-success/30" : "bg-line"}`}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function methodToLabel(method: MatchMethod, confidence: MatchConfidence | null): string | null {
  if (!method) return null;
  switch (method) {
    case "barcode": return "📦 바코드";
    case "alias_exact":
    case "alias_short": return "별칭 일치";
    case "normalize_exact": return "이름 일치";
    case "partial":
      return confidence === "high" ? "95% 일치"
        : confidence === "medium" ? "75% — 확인"
        : "65% — 의심";
    default: return null;
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
      className={[
        "rounded-xl p-3 border",
        highlight
          ? "bg-brand-soft border-brand-500/30"
          : "bg-surface-muted border-line",
      ].join(" ")}
    >
      {/* 한국어 라벨엔 uppercase/tracking-wider/mono가 시각적으로 어색 — 평범한 한글 캡션 */}
      <div className="text-[11px] text-ink-3 font-medium">{label}</div>
      <div
        className={[
          "mt-1 text-sm font-semibold truncate",
          highlight ? "text-brand-ink" : "text-ink-1",
        ].join(" ")}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
