"use client";

import { useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";
import CameraCapture from "@/components/CameraCapture";
import { IconCamera, IconCheck, IconReceipt } from "@/components/icons";

type ParsedItem = {
  rawName: string;
  price: number;
  quantity: number;
  productId: string | null;
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);

  function handleCameraCapture(dataUrl: string) {
    setImagePreview(dataUrl);
    setImageBase64(dataUrl.split(",")[1] ?? null);
    setCameraOpen(false);
    setResult(null);
    setSubmitResult(null);
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
    reader.onload = () => {
      const result = reader.result as string;
      setImageBase64(result.split(",")[1] ?? null);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  }

  async function parse() {
    setParsing(true);
    setResult(null);
    setSubmitResult(null);
    // 60초 client-side timeout — server timeout 후 무한 대기 방지
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64 }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody.error ?? `OCR 실패 (${res.status})`);
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
      setSubmitResult(`❌ ${msg}`);
    } finally {
      setParsing(false);
    }
  }

  async function submit() {
    if (!result || !storeId) return alert("매장을 선택해주세요");
    const valid = items.filter((i) => i.productId && i.price > 0);
    if (valid.length === 0) return alert("매칭된 항목이 없습니다");

    setSubmitting(true);
    const res = await fetch("/api/receipts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receiptId: result.receiptId,
        storeId,
        items: valid.map((i) => ({
          productId: i.productId,
          price: i.price,
          quantity: i.quantity,
        })),
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.ok) {
      const awardedNote = data.awarded
        ? `포인트 +${data.count * 2}점 적립`
        : "로그인하면 포인트가 적립됩니다";
      setSubmitResult(`✅ ${data.count}건 등록 완료! ${awardedNote}.`);
    } else {
      setSubmitResult(`❌ 실패: ${data.error ?? "알 수 없는 오류"}`);
    }
  }

  const matchedCount = items.filter((i) => i.productId).length;

  // 진행 단계 — 0: 사진 업로드, 1: OCR, 2: 매칭, 3: 등록 완료
  const currentStep = submitResult?.startsWith("✅")
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

      <p className="text-ink-2">
        영수증 사진을 올리면 자동으로 품목을 인식해 가격을 등록합니다.
        <br />
        <span className="text-xs text-ink-3">
          (CLOVA OCR 키 미설정 시 데모 데이터로 작동합니다)
        </span>
      </p>

      {/* 큰 카메라 CTA — 화면 중앙, 80% 너비 */}
      {!result && (
        <section className="bg-white border border-line rounded-xl p-6 space-y-6">
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="w-[80%] flex flex-col items-center gap-3 py-10 border-2 border-dashed border-brand-200 hover:border-brand-400 hover:bg-brand-50 rounded-xl transition-colors text-brand-600"
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
          </div>

          {imagePreview && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              <IconCheck size={14} />
              <span>사진 준비됨 — 아래 &quot;OCR 시작&quot; 버튼을 누르세요</span>
            </div>
          )}

          <div className="text-xs text-ink-3 text-center">
            이미지를 안 올려도 데모 데이터로 흐름을 확인할 수 있어요.
          </div>

          <button
            onClick={parse}
            disabled={parsing}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white px-5 py-3 rounded-lg font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2"
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
          <div className="bg-white border border-line rounded-xl p-4">
            <h2 className="font-bold mb-3 text-sm text-ink-2">영수증 이미지</h2>
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
          <div className="bg-white border border-line rounded-xl p-6 space-y-4">
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
                품목 매칭 ({matchedCount}/{items.length}건 자동 매칭)
              </label>
              <div className="space-y-2">
                {items.map((it, idx) => {
                  const ok = !!it.productId;
                  return (
                    <div
                      key={idx}
                      className={`rounded-md p-2 border text-sm ${
                        ok
                          ? "bg-emerald-50/40 border-emerald-200"
                          : "bg-rose-50/40 border-rose-200"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="shrink-0 mt-0.5"
                          aria-label={ok ? "매칭 성공" : "매칭 실패"}
                          title={ok ? "자동 매칭됨" : "수동 매칭 필요"}
                        >
                          {ok ? (
                            <span className="text-emerald-600">✓</span>
                          ) : (
                            <span className="text-rose-600">⚠️</span>
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          {/* 영수증 원본 라인은 줄바꿈 허용 — 사용자가 어떤 항목인지 식별해야 매칭 가능 */}
                          <div className="text-ink-2 break-words text-xs mb-1">
                            <span className="text-ink-3">원본: </span>
                            {it.rawName}
                          </div>
                          <select
                            value={it.productId ?? ""}
                            onChange={(e) => {
                              const next = [...items];
                              next[idx] = {
                                ...it,
                                productId: e.target.value || null,
                              };
                              setItems(next);
                            }}
                            aria-label="상품 매칭"
                            className={`w-full px-2 py-1 border rounded text-xs ${
                              ok
                                ? "border-emerald-300 bg-white"
                                : "border-rose-300 bg-white"
                            }`}
                          >
                            <option value="">선택 안 함 (제외)</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex justify-between items-center mt-1 text-xs">
                            <span className="text-ink-3">
                              x{it.quantity}
                            </span>
                            <span className="font-semibold tabular-nums text-ink-1">
                              {formatWon(it.price)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              onClick={submit}
              disabled={submitting || !storeId}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
            >
              {submitting ? "등록 중..." : "✓ 가격 등록 (포인트 +2/건)"}
            </button>

            {submitResult && (
              <div className="text-center text-sm pt-2 text-ink-1">
                {submitResult}
                <div className="mt-2">
                  <Link
                    href="/search"
                    className="text-brand-600 hover:underline"
                  >
                    다른 상품 가격 보러가기 →
                  </Link>
                </div>
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
