"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// 농산물이력추적 정보 — 농수산물(KAMIS) 상품 상세에서 사용
// product.name(예: "사과", "배추")으로 rprsntPrdltName LIKE 검색하여 등록된 농가/단체 노출.

type AgriTraceItem = {
  id: string;
  histTraceRegNo: string;
  regInstName: string | null;
  rprsntPrdltName: string;
  presidentName: string | null;
  orgnName: string | null;
  validBeginDate: string | null;
  validEndDate: string | null;
  partners: unknown;
};

type LookupResponse = {
  items: AgriTraceItem[];
  count: number;
  error?: string;
};

export default function AgriTraceLookup({ productName }: { productName: string }) {
  const [data, setData] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `/api/agritrace?q=${encodeURIComponent(productName)}&limit=10`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: LookupResponse | null) => {
        if (!cancelled) {
          setData(j);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [productName]);

  if (loading) {
    return (
      <section className="bg-white border border-border rounded-xl p-4">
        <div className="h-5 w-36 bg-stone-100 rounded animate-pulse mb-3" />
        <div className="text-xs text-stone-400">
          농가 이력 정보 불러오는 중...
        </div>
      </section>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <section className="bg-white border border-border rounded-xl p-4">
        <h2 className="font-bold text-sm mb-1 flex items-center gap-2">
          🌱 농산물이력추적
        </h2>
        <div className="text-xs text-stone-400">
          등록된 농가 이력 없음
        </div>
        <div className="text-[11px] text-stone-400 mt-1">
          출처: 식품안전나라 (국립농산물품질관리원)
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white border border-border rounded-xl p-4">
      <h2 className="font-bold text-sm mb-1 flex items-center gap-2">
        🌱 농산물이력추적
        <span className="text-[10px] font-normal text-stone-500 bg-stone-100 rounded px-1.5 py-0.5">
          {data.items.length}건
        </span>
      </h2>
      <div className="text-[11px] text-stone-500 mb-2">
        출처: 식품안전나라 (국립농산물품질관리원)
      </div>

      <ul className="space-y-2">
        {data.items.map((item) => (
          <li
            key={item.id}
            className="border border-border rounded-lg p-2.5 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-800 truncate">
                  {item.orgnName ?? "(농가명 미상)"}
                </div>
                <div className="text-xs text-stone-500 mt-0.5">
                  {item.rprsntPrdltName}
                  {item.presidentName ? ` · 대표 ${item.presidentName}` : ""}
                </div>
              </div>
              <div className="text-[10px] text-stone-400 shrink-0 text-right">
                <div className="font-mono">{item.histTraceRegNo}</div>
                {item.validEndDate && (
                  <div className="mt-0.5">~{item.validEndDate}</div>
                )}
              </div>
            </div>
            {item.regInstName && (
              <div className="text-[11px] text-stone-400 mt-1">
                등록기관: {item.regInstName}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 text-right">
        <Link
          href={`/agritrace?q=${encodeURIComponent(productName)}`}
          className="text-xs text-brand-600 hover:underline"
        >
          전체 보기 →
        </Link>
      </div>
    </section>
  );
}
