"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Product = { id: string; name: string };
type Store = { id: string; name: string; chainName: string };

export default function ContributePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [productId, setProductId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [price, setPrice] = useState("");
  // 정가 + 행사가 분리 입력 — 행사가 있으면 paidPrice/promotionType도 같이
  const [paidPrice, setPaidPrice] = useState("");
  const [promotionType, setPromotionType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/products?limit=200")
      .then((r) => r.json())
      .then((d) => setProducts(d.products));
    fetch("/api/stores")
      .then((r) => r.json())
      .then((d) => setStores(d.stores));
  }, []);

  async function submit() {
    if (!productId || !storeId || !price) {
      return alert("모든 항목을 입력해주세요");
    }
    setSubmitting(true);
    setMsg(null);
    const lp = parseInt(price, 10);
    const pp = paidPrice ? parseInt(paidPrice, 10) : null;
    const res = await fetch("/api/prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        storeId,
        listPrice: lp,
        paidPrice: pp,
        promotionType: promotionType.trim() || null,
        source: "manual",
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (data.ok) {
      setMsg(
        data.awarded
          ? "✅ 가격 등록 완료! 포인트 +5 적립"
          : "✅ 가격 등록 완료! (로그인하면 포인트 적립)"
      );
      setPrice("");
      setPaidPrice("");
      setPromotionType("");
    } else {
      setMsg(`❌ ${data.error}`);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">✍️ 가격 직접 입력</h1>
      <p className="text-stone-600 text-sm">
        영수증이 없어도 본 가격을 직접 등록할 수 있어요.
      </p>

      <div className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">상품</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full px-3 py-2 border border-stone-300 rounded"
          >
            <option value="">상품 선택...</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">매장</label>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="w-full px-3 py-2 border border-stone-300 rounded"
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
          <label className="block text-sm font-medium mb-1">정가 (원)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="예: 4280"
            className="w-full px-3 py-2 border border-stone-300 rounded"
          />
        </div>

        <div className="border-t border-stone-100 pt-3 space-y-2">
          <div className="text-xs text-stone-500">
            행사 중이라면 아래 두 칸도 입력 (선택)
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">행사가 (원)</label>
            <input
              type="number"
              value={paidPrice}
              onChange={(e) => setPaidPrice(e.target.value)}
              placeholder="예: 3990"
              className="w-full px-3 py-2 border border-stone-300 rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">행사 유형</label>
            <select
              value={promotionType}
              onChange={(e) => setPromotionType(e.target.value)}
              className="w-full px-3 py-2 border border-stone-300 rounded"
            >
              <option value="">— 선택 —</option>
              <option value="할인">할인</option>
              <option value="1+1">1+1</option>
              <option value="2+1">2+1</option>
              <option value="번들">번들</option>
              <option value="쿠폰">쿠폰</option>
            </select>
          </div>
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full bg-brand-500 hover:bg-brand-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-50"
        >
          {submitting ? "등록 중..." : "✓ 등록하기 (포인트 +5)"}
        </button>

        {msg && <div className="text-center text-sm">{msg}</div>}
      </div>

      <div className="text-center text-sm">
        <Link href="/upload" className="text-brand-600 hover:underline">
          영수증으로 한 번에 여러 건 등록하기 →
        </Link>
      </div>
    </div>
  );
}
