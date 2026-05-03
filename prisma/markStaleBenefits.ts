// 만료/종료된 Benefit을 active=false 처리하는 수동 실행 스크립트.
// /api/cron/stale-benefits 의 동일 로직을 CLI로도 사용 가능하게 한 것.
//
// 실행: npm run db:mark:stale
//
// 정책 (3가지 OR — 하나만 만족해도 deactivate):
//   1. 마감일 경과 7일 이상: applyEndAt < (today - 7일)
//   2. 종료 키워드 본문: eligibilityRules의 자유텍스트에 마감 키워드 포함
//   3. 장기 미동기화: lastSyncedAt < (today - 60일)
//
// 멱등 — 이미 active=false인 항목은 건드리지 않음. 여러 번 돌려도 안전.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// .env를 process.env로 로드 (tsx는 자동 로드 안 함, 외부 dependency 회피)
function loadEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, raw] = m;
      const v = raw.replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* .env 없으면 무시 */
  }
}
loadEnv();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 마감/종료를 의미하는 한국어 키워드
const TERMINATION_KEYWORDS = [
  "접수마감",
  "신청마감",
  "모집마감",
  "선정완료",
  "예산소진",
  "사업종료",
  "조기마감",
];

// eligibilityRules(Json)의 모든 string 값을 재귀로 평탄화
function flattenStrings(value: unknown, out: string[]): void {
  if (value == null) return;
  if (typeof value === "string") {
    if (value.trim()) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) flattenStrings(v, out);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      flattenStrings(v, out);
    }
  }
}

function hasTerminationKeyword(rules: unknown): boolean {
  const buf: string[] = [];
  flattenStrings(rules, buf);
  if (buf.length === 0) return false;
  // 모든 공백 제거 — 한국어는 대소문자 영향 없음, 띄어쓰기 변형 대응
  const joined = buf.join(" ").replace(/\s+/g, "");
  return TERMINATION_KEYWORDS.some((kw) => joined.includes(kw));
}

async function main() {
  const start = Date.now();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  console.log("[mark-stale] 시작");
  console.log(`  기준 시각: ${now.toISOString()}`);
  console.log(`  7일 컷오프: ${sevenDaysAgo.toISOString()}`);
  console.log(`  60일 컷오프: ${sixtyDaysAgo.toISOString()}`);

  // 정책 1: 마감일 경과 7일 이상
  const dateExpiredResult = await prisma.benefit.updateMany({
    where: {
      active: true,
      applyEndAt: { lt: sevenDaysAgo },
    },
    data: { active: false },
  });
  const dateExpired = dateExpiredResult.count;
  console.log(`  [정책1] 마감일 경과 7일+ : ${dateExpired}건 비활성화`);

  // 정책 2 + 3: active 후보 메모리 조회 후 평가
  const candidates = await prisma.benefit.findMany({
    where: { active: true },
    select: { id: true, eligibilityRules: true, lastSyncedAt: true, title: true },
  });
  console.log(`  [후보] active 잔여: ${candidates.length}건`);

  const keywordIds: string[] = [];
  const longUnsyncedIds: string[] = [];

  for (const b of candidates) {
    if (hasTerminationKeyword(b.eligibilityRules)) {
      keywordIds.push(b.id);
      continue;
    }
    if (b.lastSyncedAt < sixtyDaysAgo) {
      longUnsyncedIds.push(b.id);
    }
  }

  let keywordTerminated = 0;
  if (keywordIds.length > 0) {
    const r = await prisma.benefit.updateMany({
      where: { id: { in: keywordIds }, active: true },
      data: { active: false },
    });
    keywordTerminated = r.count;
  }
  console.log(`  [정책2] 종료 키워드 매치 : ${keywordTerminated}건 비활성화`);

  let longUnsynced = 0;
  if (longUnsyncedIds.length > 0) {
    const r = await prisma.benefit.updateMany({
      where: { id: { in: longUnsyncedIds }, active: true },
      data: { active: false },
    });
    longUnsynced = r.count;
  }
  console.log(`  [정책3] 장기 미동기화 60일+ : ${longUnsynced}건 비활성화`);

  const total = dateExpired + keywordTerminated + longUnsynced;
  console.log(
    `[mark-stale] 완료 — 총 ${total}건 비활성화 (소요 ${Date.now() - start}ms)`,
  );
}

main()
  .catch((e) => {
    console.error("[mark-stale] 실패:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
