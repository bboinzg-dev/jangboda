// 외부 API 키·시크릿 중앙 접근 모듈 (server-only)
//
// 목적:
//   - 같은 키를 여러 파일에서 직접 process.env로 읽으며 폴백 패턴이 흩어지는 문제 해결.
//   - 누락 시 동작(graceful degrade)을 한 곳에서 결정.
//   - .env 파일 직접 읽기 fallback도 한 곳에서 관리 (스크립트/tsx 실행 환경 대응).
//
// 사용:
//   import { foodSafetyKey, dataGoKrKey } from "@/lib/env";
//   const key = foodSafetyKey(); // null이면 호출자가 graceful skip
//
// 주의: NEXT_PUBLIC_* 변수는 클라이언트 번들에 포함되므로 이 파일에서 다루지 않음.

import { readFileSync } from "node:fs";

// 같은 키를 여러 번 읽는 비용 최소화 — .env 파일 캐시
let dotEnvCache: string | null | undefined;
function readDotEnvFile(): string | null {
  if (dotEnvCache !== undefined) return dotEnvCache;
  try {
    dotEnvCache = readFileSync(".env", "utf8");
  } catch {
    dotEnvCache = null;
  }
  return dotEnvCache;
}

function fromDotEnv(name: string): string | null {
  const txt = readDotEnvFile();
  if (!txt) return null;
  const re = new RegExp(`${name}\\s*=\\s*"?([^"\\n\\r]+)"?`);
  const m = txt.match(re);
  return m ? m[1].trim() : null;
}

function envOrDotEnv(...names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  for (const n of names) {
    const v = fromDotEnv(n);
    if (v) return v;
  }
  return null;
}

/**
 * 식약처/한국식품정보원 KOREANNET API 키.
 * 두 환경변수명을 모두 지원 — KOREANNET이 최신, FOODSAFETY는 레거시 호환.
 * .env 파일 직접 읽기 fallback 포함 (tsx/스크립트 환경 대응).
 */
export function foodSafetyKey(): string | null {
  return envOrDotEnv("KOREANNET_API_KEY", "FOODSAFETY_API_KEY");
}

/**
 * data.go.kr 통합 서비스 키 (정부 혜택·영양정보·참가격 등 다수 API에서 공용).
 * 한 키로 모든 data.go.kr 엔드포인트 호출 가능.
 */
export function dataGoKrKey(): string | null {
  return envOrDotEnv("DATA_GO_KR_SERVICE_KEY");
}
