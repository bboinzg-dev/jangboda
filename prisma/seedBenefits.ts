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
  // ─── 워크넷/HRD-Net 직업훈련 5종 (개별 강좌 대신 메타 1건씩) ───
  // ※ 고유가 피해지원금은 GOV24(보조금24)에 이미 등록되어 있어 MANUAL 중복 항목 제거됨
  {
    sourceCode: SOURCE_CODES.MANUAL,
    sourceId: "hrd-tomorrow-card",
    title: "국민내일배움카드",
    summary:
      "구직자·재직자·자영업자가 직업능력개발 훈련 비용을 정부 지원으로 받을 수 있는 카드. 5년간 300~500만원 한도.",
    agency: "고용노동부",
    category: "고용·창업",
    targetType: "individual",
    regionCodes: ["00000"],
    eligibilityRules: {
      지원대상:
        "만 15세 이상 실업·재직·자영업자 누구나 (공무원·사립학교 교직원·졸업예정자 등 일부 제외)",
      선정기준: "고용보험 가입 이력 또는 구직 등록자",
      지원내용:
        "5년간 300만원(일반)~500만원(취약계층) 훈련비 + 훈련장려금",
      신청방법: "HRD-Net 또는 가까운 고용센터 방문/온라인 신청",
      지원유형: "훈련/교육",
    },
    detailUrl: "https://www.hrd.go.kr/hrdp/ti/ptiao/PTIAO0100L.do",
    applyUrl: "https://www.hrd.go.kr/hrdp/ti/ptiao/PTIAO0100L.do",
  },
  {
    sourceCode: SOURCE_CODES.MANUAL,
    sourceId: "hrd-employer-training",
    title: "사업주 직업능력개발 훈련",
    summary:
      "사업주가 소속 근로자에게 직업훈련 실시 시 훈련비·인건비를 정부 지원. 중소기업 우대.",
    agency: "고용노동부",
    category: "고용·창업",
    targetType: "business",
    regionCodes: ["00000"],
    eligibilityRules: {
      지원대상: "고용보험 가입 사업주 (우선지원 대상기업 우대)",
      선정기준: "사전 훈련계획 신고 + 인정받은 훈련과정 실시",
      지원내용:
        "훈련비(과정·시간 비례) + 훈련수당·임금의 일부. 중소기업은 추가 가산",
      신청방법: "HRD-Net에서 훈련과정 검색 → 사전신고 → 실시 후 환급 신청",
      지원유형: "훈련/교육",
    },
    detailUrl: "https://www.hrd.go.kr/hrdp/em/pemao/PEMAO0100L.do",
    applyUrl: "https://www.hrd.go.kr/hrdp/em/pemao/PEMAO0100L.do",
  },
  {
    sourceCode: SOURCE_CODES.MANUAL,
    sourceId: "hrd-consortium",
    title: "국가인적자원개발 컨소시엄",
    summary:
      "여러 중소기업이 공동으로 훈련시설을 활용해 근로자 직업훈련을 받는 사업. 훈련비 전액 지원.",
    agency: "고용노동부",
    category: "고용·창업",
    targetType: "business",
    regionCodes: ["00000"],
    eligibilityRules: {
      지원대상: "운영기관(대기업·대학 등)과 협약한 중소기업 및 그 근로자",
      선정기준: "운영기관 선정 → 회원기업 모집",
      지원내용: "훈련비·기숙사·교통비 등 사업주·근로자 부담 없이 훈련 제공",
      신청방법: "운영기관 또는 회원기업 통해 신청",
      지원유형: "훈련/교육",
    },
    detailUrl: "https://www.c-hrd.net/",
    applyUrl: "https://www.c-hrd.net/",
  },
  {
    sourceCode: SOURCE_CODES.MANUAL,
    sourceId: "hrd-work-learn",
    title: "일학습병행제",
    summary:
      "기업 현장에서 일하면서 학습 → 국가인정 자격·학위 취득. 청년·미취업자 + 사업주 훈련수당 지원.",
    agency: "고용노동부",
    category: "고용·창업",
    targetType: "mixed",
    regionCodes: ["00000"],
    eligibilityRules: {
      지원대상: "만 15~34세 청년 미취업자(학습근로자) + 참여 사업주",
      선정기준: "공동훈련센터/대학 등이 매칭한 기업·근로자",
      지원내용:
        "학습근로자: 임금·훈련비. 사업주: 훈련 인프라·기업현장교사 인건비 등",
      신청방법: "참여기업 채용공고 → HRD-Net 학습근로자 신청",
      지원유형: "훈련/교육",
    },
    detailUrl: "https://www.bizhrd.net/",
    applyUrl: "https://www.bizhrd.net/",
  },
  {
    sourceCode: SOURCE_CODES.MANUAL,
    sourceId: "hrd-jobseeker-program",
    title: "구직자 취업역량 강화 프로그램",
    summary:
      "구직 의사가 있는 미취업자를 위한 취업상담·집단상담·심리검사·취업알선 패키지.",
    agency: "고용노동부",
    category: "고용·창업",
    targetType: "individual",
    regionCodes: ["00000"],
    eligibilityRules: {
      지원대상: "만 18세 이상 구직 의사가 있는 미취업자",
      선정기준: "워크넷 구직 등록 후 고용센터 방문 상담",
      지원내용:
        "1:1 취업상담, 집단상담 프로그램(취업희망/성취), 심리검사, 취업알선",
      신청방법: "워크넷 구직 등록 + 가까운 고용센터 방문",
      지원유형: "취업지원",
    },
    detailUrl: "https://www.work24.go.kr/",
    applyUrl: "https://www.work24.go.kr/",
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

  // gov24는 가장 풍부 — totalCount 10,931 (2026-05 기준)
  // perPage 1000 × maxPages 12 = 12,000 한도 (호출 횟수 12회로 throttle 회피)
  // 이전 perPage=100/maxPages=110 조합은 호출 110회로 일시 throttle 발생 (page 39부터 400)
  await runOne("gov24", (o) => fetchGov24(o), { perPage: 1000, maxPages: 12 });
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
