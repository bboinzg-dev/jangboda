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
  // 정기 휴무 패턴 — 대형마트·SSM 의무휴업제 (유통산업발전법)
  //   "2,4-sun" = 매달 둘째·넷째 일요일 (수도권 대부분이 default)
  //   "1,3-sun" = 매달 첫째·셋째 일요일 (일부 지역)
  // 지자체별 차이는 있지만, 의무휴업이 있다는 사실 고지가 사용자에게 안전.
  closedDays?: "2,4-sun" | "1,3-sun";
  closedNote?: string;
};

// chain.name 기준 — DB의 chain 이름과 정확히 일치해야 함
//
// 의무휴업제: 대규모점포(대형마트)와 일부 SSM은 매월 2회 의무휴업 (유통산업발전법).
// 수도권 대부분이 둘째·넷째 일요일이라 default로 "2,4-sun" 적용.
// 지점별 정확한 휴무일은 카카오맵 등에서 확인 필요 — 사용자에게 안내 문구로 고지.
const CHAIN_HOURS: Record<string, ChainHoursDefault> = {
  // ─── 대형마트 (의무휴업 적용 — 매달 2,4번째 일요일 default) ────────────────────
  "이마트": {
    hours: "10:00~23:00",
    source: "chain",
    closedDays: "2,4-sun",
    closedNote: "지점별 휴무일 다를 수 있음 — 정확한 휴무일은 매장에 확인",
  },
  "이마트 트레이더스": {
    hours: "10:00~23:00",
    source: "chain",
    closedDays: "2,4-sun",
  },
  "트레이더스": {
    hours: "10:00~23:00",
    source: "chain",
    closedDays: "2,4-sun",
  },
  "홈플러스": {
    hours: "10:00~24:00",
    source: "chain",
    note: "일부 지점 영업시간 다름",
    closedDays: "2,4-sun",
    closedNote: "지점별 휴무일 다를 수 있음",
  },
  "홈플러스 익스프레스": {
    hours: "10:00~23:00",
    source: "chain",
    closedDays: "2,4-sun",
  },
  "롯데마트": {
    // 사용자 제보: 천호점은 10:00~23:00 (24:00 아님). 다수 지점 같은 시간으로 보정.
    hours: "10:00~23:00",
    source: "chain",
    note: "일부 지점 영업시간 다름",
    closedDays: "2,4-sun",
    closedNote: "지점별 휴무일 다를 수 있음",
  },
  "롯데마트 맥스": {
    hours: "10:00~23:00",
    source: "chain",
    closedDays: "2,4-sun",
  },
  "코스트코": {
    hours: "10:00~22:00",
    source: "chain",
    closedDays: "2,4-sun",
  },
  "킴스클럽": {
    hours: "10:00~23:00",
    source: "chain",
    closedDays: "2,4-sun",
  },
  "농협하나로마트": {
    hours: "09:00~22:00",
    source: "chain",
    note: "지역별 영업시간 다름",
    // 농협하나로마트는 농수산물 비중에 따라 의무휴업 면제 받는 매장 多 — 안내 안 함
  },
  "하나로마트": {
    hours: "09:00~22:00",
    source: "chain",
    note: "지역별 영업시간 다름",
  },

  // ─── 슈퍼·SSM (일부 SSM도 의무휴업 적용) ──────────────────────────
  "GS더프레시": { hours: "09:00~23:00", source: "chain" },
  "GS THE FRESH": { hours: "09:00~23:00", source: "chain" },
  "롯데슈퍼": {
    hours: "10:00~23:00",
    source: "chain",
    closedDays: "2,4-sun",
    closedNote: "일부 지점만 의무휴업 적용",
  },
  "이마트에브리데이": {
    hours: "10:00~22:00",
    source: "chain",
    closedDays: "2,4-sun",
    closedNote: "일부 지점만 의무휴업 적용",
  },
  "이마트 에브리데이": {
    hours: "10:00~22:00",
    source: "chain",
    closedDays: "2,4-sun",
    closedNote: "일부 지점만 의무휴업 적용",
  },

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
): {
  hours: string | null;
  source: "store" | "chain" | "unknown";
  note?: string;
  closedDays?: ChainHoursDefault["closedDays"];
  closedNote?: string;
} {
  const def = getChainDefaultHours(chainName);
  if (storeHours && storeHours.trim()) {
    // store.hours가 있어도 의무휴업 정보는 chain default에서 가져와 동시 반환
    return {
      hours: storeHours.trim(),
      source: "store",
      closedDays: def?.closedDays,
      closedNote: def?.closedNote,
    };
  }
  if (def)
    return {
      hours: def.hours,
      source: "chain",
      note: def.note,
      closedDays: def.closedDays,
      closedNote: def.closedNote,
    };
  return { hours: null, source: "unknown" };
}

// 오늘이 의무휴업일인지 판정.
// "2,4-sun" — 매달 둘째·넷째 일요일
// "1,3-sun" — 매달 첫째·셋째 일요일
// 한국 기준 — 사용자 timezone이 한국이라 가정. 글로벌 사용자 케이스는 향후 보강.
// KST 고정 — 서버(UTC)에서 호출되어도 한국 날짜·요일로 판정
function toKst(d: Date): Date {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

export function isClosedToday(
  closedDays: ChainHoursDefault["closedDays"] | undefined,
  now = new Date(),
): boolean {
  if (!closedDays) return false;
  const kst = toKst(now);
  if (kst.getUTCDay() !== 0) return false; // 일요일 아니면 false
  // 그 달의 몇 번째 일요일인지 계산
  const date = kst.getUTCDate();
  const ordinal = Math.floor((date - 1) / 7) + 1; // 1=첫째, 2=둘째, ...
  if (closedDays === "2,4-sun") return ordinal === 2 || ordinal === 4;
  if (closedDays === "1,3-sun") return ordinal === 1 || ordinal === 3;
  return false;
}

// 다음 의무휴업일 계산 (오늘 포함하지 않음) — 카드 안내용 ("다음 휴무: 5/10")
export function nextClosedDate(
  closedDays: ChainHoursDefault["closedDays"] | undefined,
  from = new Date(),
): Date | null {
  if (!closedDays) return null;
  // 다음 60일 안에서 첫 일치 일요일 찾기 — KST 기준
  const baseKst = toKst(from);
  for (let i = 1; i <= 60; i++) {
    const d = new Date(baseKst);
    d.setUTCDate(d.getUTCDate() + i);
    if (d.getUTCDay() !== 0) continue;
    const ordinal = Math.floor((d.getUTCDate() - 1) / 7) + 1;
    if (
      (closedDays === "2,4-sun" && (ordinal === 2 || ordinal === 4)) ||
      (closedDays === "1,3-sun" && (ordinal === 1 || ordinal === 3))
    ) {
      // 호출자가 toLocaleDateString 등으로 표시하기 때문에 KST 날짜를 가진 Date 반환
      return d;
    }
  }
  return null;
}
