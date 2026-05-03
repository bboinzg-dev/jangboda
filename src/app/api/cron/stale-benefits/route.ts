// 정부 혜택 만료/종료 자동 비활성화 cron — 매일 KST 05:00 (UTC 20:00)
// sync(03:00 KST) → normalize(04:00 KST) → stale(05:00 KST) 순서로 실행되어
// 가장 최신 데이터 기준으로 만료된 항목을 정리한다.
//
// 정책 (3가지 OR — 하나만 만족해도 deactivate):
//   1. 마감일 경과 7일 이상: applyEndAt < (today - 7일) 인 active Benefit
//   2. 종료 키워드 본문: eligibilityRules의 자유텍스트(string 값)에 마감 키워드 포함
//   3. 장기 미동기화: lastSyncedAt < (today - 60일) AND active=true
//      → 출처에서 사라졌을 가능성이 높음 (매일 sync가 정상이면 lastSyncedAt이 매일 갱신됨)
//
// 인증: Authorization: Bearer ${CRON_SECRET}
// 수동 호출: curl -H "Authorization: Bearer $CRON_SECRET" https://.../api/cron/stale-benefits
//
// 멱등 — 이미 active=false인 항목은 건드리지 않음.
import { NextResponse, type NextRequest } from "next/server";
import { PrismaClient } from "@prisma/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const prisma = new PrismaClient();

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 개발/로컬 모드
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// 마감/종료를 의미하는 한국어 키워드 (공백 정규화 후 contains 검사)
const TERMINATION_KEYWORDS = [
  "접수마감",
  "신청마감",
  "모집마감",
  "선정완료",
  "예산소진",
  "사업종료",
  "조기마감",
];

// eligibilityRules(Json)의 모든 string 값을 재귀로 평탄화 → 하나의 텍스트로 결합
// 공백을 제거한 정규화 텍스트를 만들어 "예산 소진" / "예산소진" 등 띄어쓰기 변형을 동시에 잡는다.
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
  // 모든 공백(스페이스/탭/개행) 제거 — 한국어는 대소문자 영향 없음
  const joined = buf.join(" ").replace(/\s+/g, "");
  return TERMINATION_KEYWORDS.some((kw) => joined.includes(kw));
}

async function handler(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // ─────────────────────────────────────────────────
  // 정책 1: 마감일 경과 7일 이상
  // ─────────────────────────────────────────────────
  const dateExpiredResult = await prisma.benefit.updateMany({
    where: {
      active: true,
      applyEndAt: { lt: sevenDaysAgo },
    },
    data: { active: false },
  });
  const dateExpired = dateExpiredResult.count;

  // ─────────────────────────────────────────────────
  // 정책 2: 종료 키워드 본문 검사
  // SQL로 Json 자유텍스트 전체를 정확히 검사하기는 어려움 → 후보를 메모리로 가져와 평가
  // (active=true이고 정책1에서 처리되지 않은 항목만 — 위에서 이미 false로 바뀐 건 제외됨)
  // ─────────────────────────────────────────────────
  const candidates = await prisma.benefit.findMany({
    where: { active: true },
    select: { id: true, eligibilityRules: true, lastSyncedAt: true },
  });

  const keywordIds: string[] = [];
  const longUnsyncedIds: string[] = [];

  for (const b of candidates) {
    if (hasTerminationKeyword(b.eligibilityRules)) {
      keywordIds.push(b.id);
      continue;
    }
    // 정책 3: 장기 미동기화 (키워드 매칭과 중복 방지를 위해 else 분기)
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

  let longUnsynced = 0;
  if (longUnsyncedIds.length > 0) {
    const r = await prisma.benefit.updateMany({
      where: { id: { in: longUnsyncedIds }, active: true },
      data: { active: false },
    });
    longUnsynced = r.count;
  }

  const total = dateExpired + keywordTerminated + longUnsynced;

  return NextResponse.json({
    elapsedMs: Date.now() - start,
    deactivated: {
      dateExpired,
      keywordTerminated,
      longUnsynced,
    },
    total,
  });
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
