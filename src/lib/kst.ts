// 한국(KST = UTC+9) 고정 시간 헬퍼
// 서버가 UTC로 동작해도 한국 사용자 기준 날짜·시간으로 판정해야 하는 곳에서 사용.
// 한국 전용 서비스이므로 글로벌 timezone 추상화는 고의로 생략.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * UTC Date를 KST로 보정한 Date 반환.
 * 반환된 Date는 timestamp가 +9h 어긋나 있으므로 반드시 `getUTC*` 메서드로 읽어야 한다.
 * (브라우저 로컬시간으로 표시할 용도가 아니라 "한국 기준 연/월/일/시" 계산용)
 */
export function toKst(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** 현재 시각의 KST 보정 Date (위와 동일한 주의: getUTC* 로만 읽기). */
export function kstNow(): Date {
  return toKst(new Date());
}

/** KST 기준 그 날의 자정(00:00:00.000)을 가리키는 Date. UTC 기준으로 보면 전날 15:00:00. */
export function kstStartOfDay(d: Date = new Date()): Date {
  const k = toKst(d);
  // UTC 메서드로 읽어 KST 연/월/일을 얻고, UTC 자정으로 만든 뒤 -9h 해서 실제 KST 자정 timestamp로
  const y = k.getUTCFullYear();
  const m = k.getUTCMonth();
  const day = k.getUTCDate();
  return new Date(Date.UTC(y, m, day) - KST_OFFSET_MS);
}

/** KST 기준 "YYYY-MM" 월 키. 가계부/통계 그룹핑용. */
export function kstMonthKey(d: Date): string {
  const k = toKst(d);
  return `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** KST 기준 현재 연도. 만 나이 계산 등에 사용. */
export function kstCurrentYear(): number {
  return kstNow().getUTCFullYear();
}
