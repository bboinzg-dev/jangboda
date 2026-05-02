// /idphoto 비밀번호 게이트 — Gemini API 호출은 유료이므로 통과한 사용자에게만 허용.
// 비밀번호 비교는 항상 서버에서 수행. 클라이언트는 통과 여부 쿠키 외 정보 모름.
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "idphoto_unlock";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 12; // 12시간

function getPassword(): string {
  return process.env.IDPHOTO_PASSWORD ?? "5235";
}

function getSecret(): string {
  // 서명용 시크릿 — 다른 시크릿이 있으면 우선 사용, 없으면 비밀번호 자체를 시크릿으로.
  // (둘 다 서버 환경변수이므로 외부 노출 없음)
  return (
    process.env.IDPHOTO_COOKIE_SECRET ??
    process.env.SYNC_TOKEN ??
    process.env.CRON_SECRET ??
    `idphoto:${getPassword()}`
  );
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function verifyPassword(input: string): boolean {
  const expected = getPassword();
  const a = Buffer.from(input ?? "", "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// 쿠키 값: "<발급시각>.<sig>" — sig는 발급시각만 서명 (사용자 식별 정보 없음).
export function makeCookieValue(): string {
  const ts = Date.now().toString();
  return `${ts}.${sign(ts)}`;
}

export function isCookieValid(value: string | undefined | null): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [ts, sig] = parts;
  const expectedSig = sign(ts);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  // 만료 체크
  const issued = Number(ts);
  if (!Number.isFinite(issued)) return false;
  const ageSec = (Date.now() - issued) / 1000;
  return ageSec >= 0 && ageSec <= COOKIE_MAX_AGE_SEC;
}

export const IDPHOTO_COOKIE = {
  name: COOKIE_NAME,
  maxAge: COOKIE_MAX_AGE_SEC,
};
