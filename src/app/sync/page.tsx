"use client";

import { useEffect, useState } from "react";
import { formatRelativeDate } from "@/lib/format";

type SyncStatus = {
  kamis: { lastSyncedAt: string | null };
  naver: { lastSyncedAt: string | null };
  counts: { products: number; stores: number; prices: number };
};

export default function SyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [kamisResult, setKamisResult] = useState<string | null>(null);
  const [naverResult, setNaverResult] = useState<string | null>(null);
  const [csvText, setCsvText] = useState(
    "product,store,chain,price,category,unit\n신라면,롯데마트 잠실점,롯데마트,4280,라면/면류,120g x 5개"
  );
  const [csvSource, setCsvSource] = useState("csv");
  const [csvResult, setCsvResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/sync/status").then((r) => r.json()).then(setStatus).catch(() => {});
  }, []);

  async function syncKamis() {
    setBusy(true);
    setKamisResult(null);
    const res = await fetch("/api/sync/kamis", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setKamisResult(
      `${data.inserted}건 등록 (${data.usedMock ? "⚠️ Mock" : "✅ 실제 KAMIS"}, ${data.date})${
        data.error ? ` — ${data.error}` : ""
      }`
    );
  }

  async function syncNaver() {
    setBusy(true);
    setNaverResult("⏳ 네이버 검색 중... (10~30초)");
    try {
      const res = await fetch("/api/sync/naver?limit=10&onlyMajor=true", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        const sampleStr = (data.samples ?? [])
          .map((s: { product: string; malls: string[] }) => `${s.product}: ${s.malls.join(", ")}`)
          .join(" / ");
        const abortNote = data.abortedEarly ? " (⚠️ 시간 초과로 일부만 처리)" : "";
        setNaverResult(
          `✅ ${data.inserted}건 가격 등록${abortNote}, 신규 매장 ${data.storesCreated}개${
            sampleStr ? `\n예시 — ${sampleStr}` : ""
          }`
        );
      } else {
        setNaverResult(`❌ ${data.error ?? "실패"}`);
      }
    } catch (e) {
      setNaverResult(`❌ 오류: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  }

  async function importCsv() {
    setBusy(true);
    setCsvResult(null);
    const res = await fetch("/api/sync/csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText, sourceLabel: csvSource }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      setCsvResult(
        `✅ ${data.inserted}건 등록 (신규 상품 ${data.createdProducts}, 신규 매장 ${data.createdStores}, 스킵 ${data.skippedCount})`
      );
    } else {
      setCsvResult(`❌ ${data.error}`);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🔄 데이터 동기화</h1>
        <p className="text-stone-600 text-sm mt-1">
          공공 데이터/외부 소스로 가격을 자동 갱신합니다.
        </p>
      </div>

      {/* 자동 갱신 안내 — 사용자가 보통 누를 일 없음 */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm">
        <div className="font-semibold text-emerald-800 mb-1">
          🤖 자동 갱신 중
        </div>
        <ul className="text-stone-700 space-y-0.5">
          <li>
            • <strong>KAMIS 농수산물 시세</strong> — 매일 새벽 자동 갱신
            {status?.kamis.lastSyncedAt && (
              <span className="text-stone-500">
                {" "}
                · 마지막 {formatRelativeDate(status.kamis.lastSyncedAt)}
              </span>
            )}
          </li>
          <li>
            • <strong>네이버 쇼핑 가격</strong> — 매일 자동 갱신 (메이저몰 우선)
            {status?.naver.lastSyncedAt && (
              <span className="text-stone-500">
                {" "}
                · 마지막 {formatRelativeDate(status.naver.lastSyncedAt)}
              </span>
            )}
          </li>
        </ul>
        <div className="text-xs text-stone-500 mt-2">
          아래 버튼은 비상 수동 갱신용. 평소엔 누를 필요 없어요.
        </div>
        {status && (
          <div className="text-xs text-stone-500 mt-2 pt-2 border-t border-emerald-200">
            현재 카탈로그: 상품 {status.counts.products.toLocaleString()} · 매장{" "}
            {status.counts.stores.toLocaleString()} · 가격{" "}
            {status.counts.prices.toLocaleString()}건
          </div>
        )}
      </div>

      <section className="card p-6 space-y-3">
        <div>
          <h2 className="font-bold">📊 KAMIS 농수산물 시세 (수동)</h2>
          <p className="text-xs text-stone-500 mt-1">
            한국 농수산물유통공사 공공 API. 양배추, 사과, 한우 등 매일 갱신.
            <br />
            환경변수 KAMIS_CERT_KEY 미설정 시 mock 데이터로 작동합니다.
          </p>
        </div>
        <button
          onClick={syncKamis}
          disabled={busy}
          className="bg-stone-700 hover:bg-stone-800 text-white px-4 py-2 rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
        >
          KAMIS 가격 가져오기
        </button>
        {kamisResult && (
          <div className="text-sm text-emerald-700 pt-2">{kamisResult}</div>
        )}
      </section>

      <section className="card p-6 space-y-3">
        <div>
          <h2 className="font-bold">🛍️ 네이버 쇼핑 (수동)</h2>
          <p className="text-xs text-stone-500 mt-1">
            카탈로그 상품을 네이버에서 검색해 쿠팡, G마켓, SSG, 11번가 등의
            가격을 한 번에 가져옵니다.
            <br />
            농수산물 카테고리는 제외 (이름이 너무 일반적이라 매칭 노이즈 큼).
          </p>
        </div>
        <button
          onClick={syncNaver}
          disabled={busy}
          className="bg-stone-700 hover:bg-stone-800 text-white px-4 py-2 rounded-lg disabled:opacity-50 inline-flex items-center gap-2"
        >
          네이버에서 온라인 가격 가져오기
        </button>
        {naverResult && (
          <div className="text-xs text-emerald-700 pt-2 break-all whitespace-pre-line">
            {naverResult}
          </div>
        )}
      </section>

      <section className="card p-6 space-y-3">
        <div>
          <h2 className="font-bold">📋 CSV 일괄 임포트</h2>
          <p className="text-xs text-stone-500 mt-1">
            소비자원 참가격, 마트 전단지, 자체 조사 등 어떤 출처든 CSV로
            받아서 일괄 등록.
            <br />
            컬럼:{" "}
            <code className="bg-stone-100 px-1">
              product, store, chain, price, category, unit, isOnSale, address, lat, lng
            </code>
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">출처 라벨</label>
          <input
            value={csvSource}
            onChange={(e) => setCsvSource(e.target.value)}
            placeholder="예: 참가격, 전단지_롯데, 자체조사"
            className="w-full px-3 py-2 border border-stone-300 rounded text-sm"
          />
        </div>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={8}
          className="w-full px-3 py-2 border border-stone-300 rounded font-mono text-xs"
        />
        <button
          onClick={importCsv}
          disabled={busy}
          className="bg-stone-700 hover:bg-stone-800 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          CSV 임포트
        </button>
        {csvResult && <div className="text-sm pt-2">{csvResult}</div>}
      </section>
    </div>
  );
}
