// 정부 혜택 모듈 시드 — 각 출처에서 혜택을 받아 Benefit 테이블에 upsert
//
// 실행: npm run db:seed:benefits
// 사전 조건: .env에 DATA_GO_KR_SERVICE_KEY, BIZINFO_API_KEY 설정
//
// 멱등 — 같은 (sourceCode, sourceId)는 update. 여러 번 돌려도 안전.

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

import { PrismaClient, Prisma } from "@prisma/client";
import { SOURCE_CODES, type BenefitRaw } from "../src/lib/benefits/types";
import { fetchGov24 } from "../src/lib/benefits/sources/gov24";
import { fetchMssBiz } from "../src/lib/benefits/sources/mssBiz";
import { fetchMssSupport } from "../src/lib/benefits/sources/mssSupport";
import { fetchBizinfo } from "../src/lib/benefits/sources/bizinfo";

const prisma = new PrismaClient();

// ───────────────────────────────────────────────────
// 수동 등록 항목 — 보조금24에 등록 지연되는 시급 사업
// 정부 발표 직후~행안부 카탈로그 등록까지 시차가 있어 직접 추가
// ───────────────────────────────────────────────────
const MANUAL_ITEMS: BenefitRaw[] = [
  {
    sourceCode: SOURCE_CODES.MANUAL,
    sourceId: "high-oil-price-relief-2026",
    title: "고유가 피해지원금 (2026년)",
    summary:
      "중동전쟁 극복 추경 사업. 1차(4/27~5/8) 기초수급/차상위/한부모, 2차(5/18~7/3) 소득 하위 70% 일반 국민. 1인당 10만~60만원.",
    agency: "행정안전부",
    category: "민생지원",
    targetType: "individual",
    regionCodes: ["00000"],
    eligibilityRules: {
      지원대상:
        "1차: 기초생활수급자, 차상위계층, 한부모가족. 2차: 소득 하위 70% 일반 국민.",
      선정기준:
        "1차는 취약계층 직접 신청. 2차는 건강보험료 등 소득 기준. 인구감소지역 +5만원.",
      지원내용:
        "기초수급 1인당 55만원, 차상위/한부모 45만원, 인구감소지역 +5만원(최대 60만원).",
      신청방법:
        "신용/체크카드, 지역사랑상품권, 선불카드 중 선택. 매출 30억 이하 소상공인 매장 또는 지역사랑상품권 가맹점에서 사용. 사용기한 2026-08-31.",
      지원유형: "현금성 민생지원",
    },
    applyStartAt: new Date("2026-04-27"),
    applyEndAt: new Date("2026-07-03"),
    detailUrl:
      "https://www.mois.go.kr/frt/sub/a06/b07/highOilPriceSupport/screen.do",
    applyUrl:
      "https://www.mois.go.kr/frt/sub/a06/b07/highOilPriceSupport/screen.do",
  },
];

async function upsertMany(items: BenefitRaw[]): Promise<number> {
  let n = 0;
  for (const item of items) {
    if (!item.sourceId || !item.title) continue;
    // Prisma JSON 필드는 InputJsonValue 타입 — Record<string, unknown> 캐스팅
    const common = {
      title: item.title,
      summary: item.summary ?? null,
      agency: item.agency ?? null,
      category: item.category ?? null,
      targetType: item.targetType ?? "individual",
      regionCodes: item.regionCodes ?? ["00000"],
      eligibilityRules: (item.eligibilityRules ?? {}) as Prisma.InputJsonValue,
      applyUrl: item.applyUrl ?? null,
      detailUrl: item.detailUrl ?? null,
      applyStartAt: item.applyStartAt ?? null,
      applyEndAt: item.applyEndAt ?? null,
      rawData: (item.rawData ?? {}) as Prisma.InputJsonValue,
    };
    await prisma.benefit.upsert({
      where: {
        sourceCode_sourceId: {
          sourceCode: item.sourceCode,
          sourceId: item.sourceId,
        },
      },
      create: {
        sourceCode: item.sourceCode,
        sourceId: item.sourceId,
        ...common,
      },
      update: { ...common, lastSyncedAt: new Date() },
    });
    n++;
  }
  return n;
}

// 페이지네이션 시드 — 빈 페이지 또는 perPage 미만 도달 시 종료
async function runOne(
  label: string,
  fetchFn: (opts: { page: number; perPage: number }) => Promise<BenefitRaw[]>,
  opts: { perPage: number; maxPages: number } = { perPage: 100, maxPages: 30 },
): Promise<void> {
  console.log(`\n[${label}] 시작 (perPage=${opts.perPage}, maxPages=${opts.maxPages})`);
  let page = 1;
  let totalFetched = 0;
  let totalSaved = 0;
  while (page <= opts.maxPages) {
    try {
      const items = await fetchFn({ page, perPage: opts.perPage });
      if (items.length === 0) {
        console.log(`[${label}] page ${page} 빈 결과 — 종료`);
        break;
      }
      const n = await upsertMany(items);
      totalFetched += items.length;
      totalSaved += n;
      console.log(`[${label}] page ${page}: 받음 ${items.length}, 저장 ${n}`);
      if (items.length < opts.perPage) {
        console.log(`[${label}] 마지막 페이지 도달`);
        break;
      }
      page++;
      // rate limit 회피
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      console.log(`[${label}] page ${page} 실패: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }
  console.log(`[${label}] 누계: 받음 ${totalFetched}, 저장 ${totalSaved}`);
}

async function main() {
  console.log("정부 혜택 시드 시작 (페이지네이션 모드)\n");

  // 수동 항목 먼저 — 보조금24에 늦게 등록되는 시급 사업
  console.log(`[MANUAL] 수동 항목 ${MANUAL_ITEMS.length}건 처리`);
  const manualSaved = await upsertMany(MANUAL_ITEMS);
  console.log(`[MANUAL] 저장 ${manualSaved}건`);

  // gov24는 가장 풍부 — maxPages 30 (3000건)
  await runOne("gov24", (o) => fetchGov24(o), { perPage: 100, maxPages: 30 });
  // 중기부/기업마당은 보통 수백~천 건 — maxPages 10
  await runOne("mssBiz", (o) => fetchMssBiz(o), { perPage: 100, maxPages: 10 });
  await runOne("mssSupport", (o) => fetchMssSupport(o), { perPage: 100, maxPages: 10 });
  await runOne("bizinfo", (o) => fetchBizinfo(o), { perPage: 100, maxPages: 10 });

  const total = await prisma.benefit.count();
  console.log(`\n총 ${total}건이 DB에 저장되어 있습니다.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
