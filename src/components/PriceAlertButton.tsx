"use client";

import { useEffect, useState } from "react";
import { createClient, isAuthConfigured } from "@/lib/supabase/client";

type Props = {
  productId: string;
  productName: string;
  currentMinPrice?: number;
};

// 클라이언트의 Push 권한 + 구독 등록 헬퍼
async function ensurePushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (!("PushManager" in window)) return null;

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (sub) return sub;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return null;

  // base64url → Uint8Array
  const padding = "=".repeat((4 - (vapidKey.length % 4)) % 4);
  const b64 = (vapidKey + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);

  sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: arr,
  });

  // 서버에 등록
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  return sub;
}

export default function PriceAlertButton({ productId, productName, currentMinPrice }: Props) {
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(
    currentMinPrice ? Math.floor(currentMinPrice * 0.9) : 0
  );
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthConfigured()) return;
    const sb = createClient();
    sb.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id } : null));
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/alerts")
      .then((r) => r.json())
      .then((d) => {
        const has = (d.alerts ?? []).some((a: { product: { id: string } }) => a.product.id === productId);
        setActive(has);
      })
      .catch(() => {});
  }, [user, productId]);

  if (!isAuthConfigured()) return null;
  if (!user) {
    return (
      <div className="text-xs text-stone-500 text-center mt-2">
        🔔 가격 알림은 로그인 후 이용 가능합니다
      </div>
    );
  }

  async function register() {
    if (threshold <= 0) {
      setMsg("임계가를 입력해주세요");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const sub = await ensurePushSubscription();
      if (!sub) {
        setMsg("푸시 권한 거부됨 — 브라우저 알림 허용 필요");
        setBusy(false);
        return;
      }
      const r = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, threshold }),
      });
      const data = await r.json();
      if (data.ok) {
        setActive(true);
        setOpen(false);
        setMsg(null);
      } else {
        setMsg(`❌ ${data.error}`);
      }
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
  }

  async function deactivate() {
    setBusy(true);
    await fetch(`/api/alerts?productId=${productId}`, { method: "DELETE" });
    setActive(false);
    setBusy(false);
  }

  if (active && !open) {
    return (
      <div className="bg-success-soft border border-success-soft rounded-lg p-3 text-sm flex items-center justify-between">
        <span>🔔 이 상품 가격 알림이 켜져있습니다</span>
        <button
          onClick={deactivate}
          disabled={busy}
          className="text-xs text-danger-text hover:underline"
        >
          해제
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-lg p-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-sm text-brand-600 hover:underline"
        >
          🔔 이 가격 이하로 떨어지면 알림 받기
        </button>
      ) : (
        <div className="space-y-2">
          <div className="text-sm font-medium">{productName} 가격 알림</div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value) || 0)}
              className="px-2 py-1 border border-stone-300 rounded w-32"
              aria-label="임계가"
            />
            <span className="text-stone-500">원 이하면</span>
            <button
              onClick={register}
              disabled={busy}
              className="bg-brand-500 hover:bg-brand-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
            >
              {busy ? "등록 중..." : "알림 켜기"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="text-stone-400 hover:text-stone-600 text-sm"
            >
              취소
            </button>
          </div>
          {msg && <div className="text-xs text-danger-text">{msg}</div>}
        </div>
      )}
    </div>
  );
}
