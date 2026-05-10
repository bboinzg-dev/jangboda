// KST 헬퍼 — 한국 사용자 전용이라 timezone 보정이 정확해야 함
// UTC 자정 직전 한국은 다음 날인 케이스를 중점적으로 검증
import { describe, expect, it } from "vitest";
import {
  kstMonthKey,
  kstStartOfDay,
  kstCurrentYear,
  toKst,
} from "./kst";

describe("kst helpers", () => {
  it("toKst는 +9h 보정한다", () => {
    const utc = new Date("2026-05-10T15:00:00.000Z"); // KST 2026-05-11 00:00
    const k = toKst(utc);
    expect(k.getUTCFullYear()).toBe(2026);
    expect(k.getUTCMonth()).toBe(4); // May = 4
    expect(k.getUTCDate()).toBe(11);
    expect(k.getUTCHours()).toBe(0);
  });

  it("kstMonthKey는 KST 기준 월을 반환 (UTC 자정 경계에서 다음 달)", () => {
    // UTC 2026-04-30 16:00 = KST 2026-05-01 01:00 → "2026-05"여야 함
    expect(kstMonthKey(new Date("2026-04-30T16:00:00.000Z"))).toBe("2026-05");
    // UTC 2026-04-30 14:00 = KST 2026-04-30 23:00 → "2026-04"여야 함
    expect(kstMonthKey(new Date("2026-04-30T14:00:00.000Z"))).toBe("2026-04");
  });

  it("kstStartOfDay는 KST 자정 timestamp를 반환", () => {
    // KST 2026-05-11 00:00:00 = UTC 2026-05-10 15:00:00
    const start = kstStartOfDay(new Date("2026-05-10T16:00:00.000Z"));
    expect(start.toISOString()).toBe("2026-05-10T15:00:00.000Z");
  });

  it("kstStartOfDay는 같은 KST 날짜 안에서 항상 같은 값", () => {
    const a = kstStartOfDay(new Date("2026-05-10T15:30:00.000Z")); // KST 5/11 00:30
    const b = kstStartOfDay(new Date("2026-05-11T14:00:00.000Z")); // KST 5/11 23:00
    expect(a.toISOString()).toBe(b.toISOString());
  });

  it("kstCurrentYear는 number를 반환", () => {
    const y = kstCurrentYear();
    expect(typeof y).toBe("number");
    expect(y).toBeGreaterThanOrEqual(2026);
  });
});
