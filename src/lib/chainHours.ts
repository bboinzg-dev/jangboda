// 체인별 일반 영업시간 사전
//
// 배경: DB의 store.hours는 대부분 null (690개 중 17개만 채워짐 = 2%).
// 하지만 같은 체인은 영업시간이 거의 일정 (이마트 10:00~23:00, GS25 24시간 등).
// 매장별 hours가 비어 있으면 이 사전으로 fallback해서 사용자에게 표시.
//
// 정확도 정책:
//   - 95%+ 매장에 적용되는 영업시간만 default로 등록
//   - 일부 지점만 다른 경우는 사용자에게 "체인 평균 영업시간" 라벨로 표시
//   - DB의 store.hours가 비어있지 않으면 그게 우선 (지점별 특수 케이스 보존)

export type ChainHoursDefault = {
  hours: string;       // "10:00~23:00", "24시간" 등 — storeHours.ts가 파싱 가능한 형태
  source: "chain";     // 출처 라벨 — UI에서 "체인 평균" 표시용
  note?: string;       // 추가 안내 (예: "일부 지점은 영업시간 다름")
};

// chain.name 기준 — DB의 chain 이름과 정확히 일치해야 함
const CHAIN_HOURS: Record<string, ChainHoursDefault> = {
  // ─── 대형마트 ────────────────────────────────────────
  "이마트": { hours: "10:00~23:00", source: "chain" },
  "이마트 트레이더스": { hours: "10:00~23:00", source: "chain" },
  "트레이더스": { hours: "10:00~23:00", source: "chain" },
  "홈플러스": { hours: "10:00~24:00", source: "chain", note: "일부 지점 영업시간 다름" },
  "홈플러스 익스프레스": { hours: "10:00~23:00", source: "chain" },
  "롯데마트": { hours: "10:00~24:00", source: "chain", note: "일부 지점 영업시간 다름" },
  "롯데마트 맥스": { hours: "10:00~24:00", source: "chain" },
  "코스트코": { hours: "10:00~22:00", source: "chain" },
  "킴스클럽": { hours: "10:00~23:00", source: "chain" },
  "농협하나로마트": { hours: "09:00~22:00", source: "chain", note: "지역별 영업시간 다름" },
  "하나로마트": { hours: "09:00~22:00", source: "chain", note: "지역별 영업시간 다름" },

  // ─── 슈퍼·SSM ───────────────────────────────────────
  "GS더프레시": { hours: "09:00~23:00", source: "chain" },
  "GS THE FRESH": { hours: "09:00~23:00", source: "chain" },
  "롯데슈퍼": { hours: "10:00~23:00", source: "chain" },
  "이마트에브리데이": { hours: "10:00~22:00", source: "chain" },
  "이마트 에브리데이": { hours: "10:00~22:00", source: "chain" },

  // ─── 편의점 (대부분 24시간) ──────────────────────────
  "GS25": { hours: "24시간", source: "chain" },
  "CU": { hours: "24시간", source: "chain" },
  "세븐일레븐": { hours: "24시간", source: "chain" },
  "7-Eleven": { hours: "24시간", source: "chain" },
  "이마트24": { hours: "24시간", source: "chain", note: "일부 비24h 점포 있음" },
  "미니스톱": { hours: "24시간", source: "chain" },

  // ─── 백화점 (오전 늦게~오후 일찍 정상) ───────────────
  "롯데백화점": { hours: "10:30~20:00", source: "chain", note: "주말·휴일 1시간 연장" },
  "신세계백화점": { hours: "10:30~20:00", source: "chain", note: "주말·휴일 1시간 연장" },
  "현대백화점": { hours: "10:30~20:00", source: "chain", note: "주말·휴일 1시간 연장" },
  "갤러리아": { hours: "10:30~20:00", source: "chain" },
  "AK플라자": { hours: "10:30~21:00", source: "chain" },

  // ─── 창고형 / 회원제 ─────────────────────────────────
  "이마트 트레이더스 홀세일클럽": { hours: "10:00~23:00", source: "chain" },
};

export function getChainDefaultHours(
  chainName: string | null | undefined,
): ChainHoursDefault | null {
  if (!chainName) return null;
  // 정확 일치 우선
  const direct = CHAIN_HOURS[chainName.trim()];
  if (direct) return direct;
  // 일부 chain 이름이 "이마트 천호점" 같은 형태로 들어올 수 있음 — 첫 토큰으로 fallback
  const firstToken = chainName.trim().split(/\s+/)[0];
  if (firstToken && firstToken !== chainName.trim()) {
    const fallback = CHAIN_HOURS[firstToken];
    if (fallback) return fallback;
  }
  return null;
}

// store.hours가 비어있으면 chain default로 보강한 (hours, source) 반환.
// 출처:
//   "store" — DB의 store.hours (지점별 실제 영업시간)
//   "chain" — 체인 default (사전)
//   "unknown" — 둘 다 없음
export function resolveStoreHours(
  storeHours: string | null | undefined,
  chainName: string | null | undefined,
): { hours: string | null; source: "store" | "chain" | "unknown"; note?: string } {
  if (storeHours && storeHours.trim()) {
    return { hours: storeHours.trim(), source: "store" };
  }
  const def = getChainDefaultHours(chainName);
  if (def) return { hours: def.hours, source: "chain", note: def.note };
  return { hours: null, source: "unknown" };
}
