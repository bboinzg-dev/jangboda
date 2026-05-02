"use client";

import { useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";

type ParsedItem = {
  rawName: string;
  price: number;
  quantity: number;
  productId: string | null;
};

type ParseResult = {
  receiptId: string;
  usedMock: boolean;
  storeId: string | null;
  storeHint?: string;
  totalAmount?: number;
  items: ParsedItem[];
};

type Store = { id: string; name: string; chainName: string };
type Product = { id: string; name: string; brand: string | null };

export default function UploadPage() {
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<string | null>(null);

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

  return (
    <div className="space-y-6">
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
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            aria-label="영수증 사진"
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
          />
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
        <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-bold">파싱 결과</h2>
            {result.usedMock && (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                Mock OCR
              </span>
            )}
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
            {result.storeHint && (
              <div className="text-xs text-stone-500 mt-1">
                추측: {result.storeHint}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              품목 매칭 ({items.filter((i) => i.productId).length}/{items.length}건 자동 매칭)
            </label>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="bg-stone-50 rounded-md p-2 md:bg-transparent md:p-0 md:grid md:grid-cols-12 md:gap-2 md:items-center text-sm"
                >
                  <div className="md:col-span-4 text-stone-600 mb-1 md:mb-0">
                    <span className="md:hidden text-xs text-stone-400">원본: </span>
                    {it.rawName}
                  </div>
                  <div className="md:col-span-5 mb-1 md:mb-0">
                    <select
                      value={it.productId ?? ""}
                      onChange={(e) => {
                        const next = [...items];
                        next[idx] = { ...it, productId: e.target.value || null };
                        setItems(next);
                      }}
                      aria-label="상품 매칭"
                      className={`w-full px-2 py-1 border rounded ${
                        it.productId
                          ? "border-emerald-300 bg-emerald-50/50"
                          : "border-rose-300 bg-rose-50/50"
                      }`}
                    >
                      <option value="">선택 안 함 (제외)</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-between md:col-span-3 md:contents">
                    <div className="md:col-span-2 md:text-right font-medium">
                      {formatWon(it.price)}
                    </div>
                    <div className="md:col-span-1 md:text-center text-stone-500">
                      x{it.quantity}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {result.totalAmount && (
            <div className="text-right text-sm text-stone-600">
              영수증 합계: <strong>{formatWon(result.totalAmount)}</strong>
            </div>
          )}

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
        </section>
      )}
    </div>
  );
}
