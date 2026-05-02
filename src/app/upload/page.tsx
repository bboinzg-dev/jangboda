"use client";

import { useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";
import CameraCapture from "@/components/CameraCapture";

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
    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 }),
    });
    const data = await res.json();
    setResult(data);
    setItems(data.items);
    setStoreId(data.storeId ?? "");
    await Promise.all([loadStores(), loadProducts()]);
    setParsing(false);
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

  return (
    <div className="space-y-6">
      {cameraOpen && (
        <CameraCapture
          onCapture={handleCameraCapture}
          onCancel={() => setCameraOpen(false)}
        />
      )}
      <h1 className="text-2xl font-bold">📸 영수증 올리기</h1>
      <p className="text-stone-600">
        영수증 사진을 올리면 자동으로 품목을 인식해 가격을 등록합니다.
        <br />
        <span className="text-xs text-stone-500">
          (CLOVA OCR 키 미설정 시 데모 데이터로 작동합니다)
        </span>
      </p>

      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">
            영수증 이미지 (선택)
          </label>

          {/* 두 가지 입력 방법 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="flex flex-col items-center gap-1 py-4 border-2 border-brand-200 hover:border-brand-400 hover:bg-brand-50 rounded-lg transition-colors"
            >
              <span className="text-2xl">📸</span>
              <span className="text-sm font-medium text-brand-700">
                카메라로 찍기
              </span>
              <span className="text-[10px] text-stone-500">즉시 촬영</span>
            </button>

            <label className="flex flex-col items-center gap-1 py-4 border-2 border-stone-200 hover:border-stone-400 hover:bg-stone-50 rounded-lg cursor-pointer transition-colors">
              <span className="text-2xl">🖼️</span>
              <span className="text-sm font-medium text-stone-700">
                갤러리에서 선택
              </span>
              <span className="text-[10px] text-stone-500">기존 사진</span>
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
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              <span>✓</span>
              <span>사진 준비됨 — 아래 "OCR 시작" 버튼을 누르세요</span>
            </div>
          )}
          <div className="text-xs text-stone-500 mt-1">
            이미지를 안 올려도 데모 데이터로 흐름을 확인할 수 있어요.
          </div>
        </div>

        <button
          onClick={parse}
          disabled={parsing}
          className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
        >
          {parsing && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" />
            </svg>
          )}
          {parsing ? "OCR 처리 중... (5~10초)" : "OCR 시작"}
        </button>
      </section>

      {result && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 왼쪽 — 이미지 미리보기 */}
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <h2 className="font-bold mb-3 text-sm text-stone-700">영수증 이미지</h2>
            {imagePreview ? (
              // 단순 img 태그 — Next/Image 안 씀 (data URL이라 외부 도메인 설정 불필요)
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreview}
                alt="영수증 미리보기"
                className="w-full rounded-md border border-stone-100 object-contain max-h-[640px]"
              />
            ) : (
              <div className="aspect-[3/4] bg-stone-50 border border-dashed border-stone-200 rounded-md flex items-center justify-center text-sm text-stone-400">
                이미지 미리보기가 여기 표시됩니다
                <br />
                (데모 모드는 이미지 없음)
              </div>
            )}
          </div>

          {/* 오른쪽 — OCR 결과 */}
          <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">파싱 결과</h2>
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
              <label className="block text-sm font-medium mb-1">매장 확인</label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded-md"
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
              <label className="block text-sm font-medium mb-2">
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
                          <div className="text-stone-600 truncate text-xs mb-1">
                            <span className="text-stone-400">원본: </span>
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
                            <span className="text-stone-500">
                              x{it.quantity}
                            </span>
                            <span className="font-medium text-stone-800">
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
              <div className="text-center text-sm pt-2">
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
        highlight ? "bg-brand-50 border border-brand-200" : "bg-stone-50 border border-stone-200"
      }`}
    >
      <div className="text-[10px] text-stone-500">{label}</div>
      <div
        className={`text-sm font-semibold truncate ${
          highlight ? "text-brand-700" : "text-stone-800"
        }`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
