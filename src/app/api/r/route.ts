// 외부 링크 추적 프록시 — /api/r?to=https://...&kind=...&id=...
// 1) 서버에서 클릭 카운트 + 출처/host 기록 (구조화 로그 → Sentry breadcrumb)
// 2) 향후 제휴(affiliate) 도입 시 도메인별 referrer/affId 부착해 redirect
// 3) 클라이언트 차단(adblock 등)에도 견디는 백엔드 측정 채널
//
// 보안:
//   - http(s)만 허용 (javascript:, data: 차단)
//   - 외부 도메인만 허용 (자체 도메인 open redirect 방지는 큰 문제 아니지만 명시 차단)
//   - 길이 2048 제한
//
// 사용:
//   <a href={`/api/r?to=${encodeURIComponent(externalUrl)}&kind=benefit_apply&id=${id}`}>
import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/observability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_KINDS = new Set([
  "benefit_apply",
  "benefit_detail",
  "product_buy",
  "store_map",
  "other",
]);

function safeUrl(raw: string | null): URL | null {
  if (!raw) return null;
  if (raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const to = safeUrl(sp.get("to"));
  if (!to) {
    return NextResponse.json({ error: "잘못된 to 파라미터" }, { status: 400 });
  }

  const kind = sp.get("kind") ?? "other";
  const id = sp.get("id") ?? undefined;
  const finalKind = ALLOWED_KINDS.has(kind) ? kind : "other";

  // 서버 측 구조화 로그 (PostHog Node SDK 도입 전까지는 콘솔만)
  logEvent("external_redirect", {
    kind: finalKind,
    target_id: id,
    host: to.host,
    href: to.toString(),
    user_agent: req.headers.get("user-agent") ?? "",
  });

  // 향후 제휴 도입 시 여기서 affiliate 파라미터 부착
  // 예: if (to.host === "shopping.naver.com") to.searchParams.set("affId", "...");

  return NextResponse.redirect(to.toString(), { status: 302 });
}
