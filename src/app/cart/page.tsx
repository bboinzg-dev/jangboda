"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatWon } from "@/lib/format";
import ProductSearchPicker from "@/components/ProductSearchPicker";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  category?: string;
  unit?: string;
};
type CartItem = { productId: string; quantity: number };
type CompareLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  available: boolean;
};
type Comparison = {
  storeId: string;
  storeName: string;
  chainName: string;
  total: number;
  availableCount: number;
  totalItems: number;
  complete: boolean;
  lines: CompareLine[];
};

export default function CartPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([
    { productId: "", quantity: 1 },
  ]);
  const [results, setResults] = useState<Comparison[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/products?limit=500")
      .then((r) => r.json())
      .then((d) => setProducts(d.products));
  }, []);

  function updateItem(idx: number, patch: Partial<CartItem>) {
    const next = [...cart];
    next[idx] = { ...next[idx], ...patch };
    setCart(next);
  }

  function addRow() {
    setCart([...cart, { productId: "", quantity: 1 }]);
  }

  function removeRow(idx: number) {
    setCart(cart.filter((_, i) => i !== idx));
  }

  async function compare() {
    const valid = cart.filter((c) => c.productId);
    if (valid.length === 0) return alert("장바구니에 상품을 추가해주세요");

    setLoading(true);
    const res = await fetch("/api/cart/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: valid }),
    });
    const data = await res.json();
    setResults(data.comparisons);
    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🛒 장바구니 가격 비교</h1>
        <p className="text-stone-600 text-sm mt-1">
          살 물건들을 모두 추가하면 마트별 합계를 비교해드려요.
        </p>
      </div>

      <section className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
        <h2 className="font-bold">장바구니</h2>
        {cart.map((item, idx) => (
          <div
            key={idx}
            className="flex gap-2 items-start text-sm"
          >
            <ProductSearchPicker
              products={products}
              selectedId={item.productId}
              onSelect={(id) => updateItem(idx, { productId: id })}
            />
            <input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) =>
                updateItem(idx, { quantity: parseInt(e.target.value) || 1 })
              }
              className="w-16 px-2 py-2 border border-stone-300 rounded text-center shrink-0 mt-0"
              aria-label="수량"
            />
            <button
              onClick={() => removeRow(idx)}
              aria-label="이 행 삭제"
              className="w-8 shrink-0 text-stone-400 hover:text-rose-500"
            >
              ✕
            </button>
          </div>
        ))}

        <div className="flex justify-between pt-2">
          <button
            onClick={addRow}
            className="text-sm text-brand-600 hover:underline"
          >
            + 상품 추가
          </button>
          <button
            onClick={compare}
            disabled={loading || cart.filter((c) => c.productId).length === 0}
            className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "계산 중..." : "마트별 비교"}
          </button>
        </div>
      </section>

      {results && (
        <section>
          <h2 className="font-bold mb-3">비교 결과</h2>
          <div className="space-y-3">
            {results.map((r, i) => (
              <div
                key={r.storeId}
                className={`bg-white border rounded-xl p-4 ${
                  i === 0 && r.complete
                    ? "border-brand-400 bg-brand-50/30"
                    : "border-stone-200"
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      {i === 0 && r.complete && (
                        <span className="bg-brand-500 text-white text-xs px-2 py-0.5 rounded-full">
                          최저가
                        </span>
                      )}
                      <span className="font-bold">{r.chainName}</span>
                      <span className="text-xs text-stone-500">
                        {r.storeName}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 mt-1">
                      {r.availableCount}/{r.totalItems}개 품목 보유
                      {!r.complete && " (일부 미보유)"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-stone-500">합계</div>
                    <div className="text-xl font-bold text-stone-900">
                      {formatWon(r.total)}
                    </div>
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="text-xs text-stone-500 cursor-pointer hover:text-stone-700">
                    품목별 가격 보기
                  </summary>
                  <ul className="mt-2 text-xs space-y-1">
                    {r.lines.map((l) => (
                      <li
                        key={l.productId}
                        className="flex justify-between border-t border-stone-100 pt-1"
                      >
                        <span>
                          {l.productName} × {l.quantity}
                        </span>
                        <span className={l.available ? "" : "text-rose-500"}>
                          {l.available ? formatWon(l.lineTotal!) : "취급 안 함"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
        </section>
      )}

      {!results && (
        <div className="text-xs text-stone-500 text-center pt-4">
          가격이 부족하다면{" "}
          <Link href="/upload" className="text-brand-600 hover:underline">
            영수증을 올려주세요
          </Link>
          .
        </div>
      )}
    </div>
  );
}
