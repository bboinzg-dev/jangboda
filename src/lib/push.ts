// Web Push 헬퍼 — 서버 사이드 발송
import webpush from "web-push";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:bboinzg@gmail.com";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; url?: string }
): Promise<{ ok: boolean; error?: string; gone?: boolean }> {
  if (!ensureConfigured()) {
    return { ok: false, error: "VAPID 키 미설정" };
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string };
    // 410 Gone, 404 Not Found → 구독이 만료됨, 정리 필요
    const gone = err.statusCode === 410 || err.statusCode === 404;
    return {
      ok: false,
      gone,
      error: err.body ?? (e instanceof Error ? e.message : String(e)),
    };
  }
}

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}
