"use client";

import { useEffect, useRef, useState } from "react";

type Product = {
  id: string;
  name: string;
  brand?: string | null;
  category?: string;
  unit?: string;
};

type Props = {
  products: Product[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
};

// 검색 가능한 상품 선택기 — select dropdown 대체
// 카탈로그가 100+개라도 빠르게 검색해서 담을 수 있게
export default function ProductSearchPicker({
  products,
  selectedId,
  onSelect,
  placeholder = "상품 검색 (예: 신라면, 우유)",
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = products.find((p) => p.id === selectedId);

  // 정규화 후 부분 일치 — 한글 띄어쓰기 무시
  const norm = (s: string) =>
    s.toLowerCase().replace(/\s+/g, "").replace(/[^가-힣a-z0-9]/g, "");
  const q = norm(query);
  const filtered =
    q.length === 0
      ? products.slice(0, 12)
      : products
          .filter((p) => {
            const hay = norm(`${p.name} ${p.brand ?? ""} ${p.category ?? ""}`);
            return hay.includes(q);
          })
          .slice(0, 12);

  function pick(p: Product) {
    onSelect(p.id);
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onSelect("");
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      {selected ? (
        <div
          className="flex items-center justify-between gap-2 px-3 py-2 border border-emerald-300 bg-emerald-50/50 rounded text-sm cursor-pointer"
          onClick={() => {
            clear();
            setOpen(true);
            setTimeout(() => {
              containerRef.current?.querySelector("input")?.focus();
            }, 0);
          }}
        >
          <div className="min-w-0">
            <div className="font-medium truncate">{selected.name}</div>
            {selected.unit && (
              <div className="text-[10px] text-stone-500 truncate">
                {selected.unit}
              </div>
            )}
          </div>
          <span
            className="text-xs text-stone-400 hover:text-rose-500 shrink-0"
            aria-label="다시 선택"
          >
            ✕
          </span>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:border-brand-400"
            aria-label="상품 검색"
          />
          {open && filtered.length > 0 && (
            <ul
              className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto bg-white border border-stone-200 rounded-md shadow-lg"
              role="listbox"
            >
              {filtered.map((p) => (
                <li
                  key={p.id}
                  onClick={() => pick(p)}
                  className="px-3 py-2 text-sm hover:bg-brand-50 cursor-pointer border-b last:border-b-0 border-stone-100"
                  role="option"
                  aria-selected="false"
                >
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-stone-500 truncate">
                    {p.category}
                    {p.brand ? ` · ${p.brand}` : ""}
                    {p.unit ? ` · ${p.unit}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {open && filtered.length === 0 && query.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-stone-200 rounded-md shadow-lg p-3 text-xs text-stone-500 text-center">
              "{query}"에 맞는 상품이 없습니다
            </div>
          )}
        </>
      )}
    </div>
  );
}
