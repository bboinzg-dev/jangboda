// 정부 혜택 카탈로그 진단 — 카테고리/출처/지역 분포 확인용 일회성 스크립트
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const v = m[2].replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {}
}
loadEnv();

import { PrismaClient, Prisma } from "@prisma/client";
const p = new PrismaClient();

async function main() {
  // 1. 카테고리 분포
  const cats = await p.benefit.groupBy({
    by: ["category"],
    where: { active: true },
    _count: true,
    orderBy: { _count: { category: "desc" } },
    take: 30,
  });
  console.log("\n=== 카테고리 분포 ===");
  for (const c of cats) console.log(`  ${c.category ?? "(null)"}: ${c._count}`);

  // 2. 출처 분포
  const sources = await p.benefit.groupBy({
    by: ["sourceCode"],
    where: { active: true },
    _count: true,
  });
  console.log("\n=== 출처 분포 ===");
  for (const s of sources) console.log(`  ${s.sourceCode}: ${s._count}`);

  // 3. 양평/지자체 관련 — agency 분석
  const yangpyeong = await p.benefit.findMany({
    where: {
      OR: [
        { agency: { contains: "양평" } },
        { title: { contains: "양평" } },
      ],
    },
    select: {
      title: true,
      agency: true,
      regionCodes: true,
      sourceCode: true,
    },
    take: 5,
  });
  console.log("\n=== 양평 관련 (위 5건) ===");
  for (const y of yangpyeong)
    console.log(
      `  [${y.sourceCode}] ${y.title} | agency=${y.agency} | regions=${y.regionCodes.join(",")}`,
    );

  // 4. 일자리 키워드 검색
  const job = await p.benefit.count({
    where: {
      active: true,
      OR: [
        { category: { contains: "일자리" } },
        { category: { contains: "고용" } },
        { category: { contains: "취업" } },
        { title: { contains: "취업" } },
        { title: { contains: "일자리" } },
        { title: { contains: "고용" } },
      ],
    },
  });
  console.log(`\n=== 일자리/고용/취업 키워드 매칭: ${job}건 ===`);

  // 5a. sourceCode별 정형화 상태 (normalizedRules가 채워졌는지)
  const sourceNorm = await p.benefit.groupBy({
    by: ["sourceCode"],
    where: { active: true },
    _count: { _all: true },
  });
  console.log("\n=== 출처별 정형화 상태 ===");
  for (const s of sourceNorm) {
    const total = s._count._all;
    const normalized = await p.benefit.count({
      where: {
        sourceCode: s.sourceCode,
        active: true,
        NOT: { normalizedRules: { equals: Prisma.DbNull } },
      },
    });
    const noText = await p.benefit.count({
      where: {
        sourceCode: s.sourceCode,
        active: true,
        normalizedRules: { equals: Prisma.DbNull },
      },
    });
    console.log(
      `  ${s.sourceCode}: 전체 ${total} / 정형 ${normalized} / 미정형(스킵 또는 실패) ${noText}`,
    );
  }

  // 5c. 행안부 API totalCount 확인 — 실제 데이터셋이 얼마나 큰지
  console.log("\n=== 행안부 GOV24 API totalCount 확인 ===");
  try {
    const key = process.env.DATA_GO_KR_SERVICE_KEY;
    if (!key) throw new Error("DATA_GO_KR_SERVICE_KEY 없음");
    const url = new URL("https://api.odcloud.kr/api/gov24/v3/serviceList");
    url.searchParams.set("page", "1");
    url.searchParams.set("perPage", "1");
    url.searchParams.set("returnType", "JSON");
    url.searchParams.set("serviceKey", key);
    const res = await fetch(url.toString());
    const json = (await res.json()) as { totalCount?: number; matchCount?: number; currentCount?: number };
    console.log(
      `  GOV24 totalCount=${json.totalCount} (우리 DB GOV24=${
        sourceNorm.find((s) => s.sourceCode === "GOV24")?._count._all ?? 0
      })`,
    );
  } catch (e) {
    console.log(`  실패: ${e instanceof Error ? e.message : e}`);
  }

  // 5b. 고유가/민생 GOV24 검색 — MANUAL 중복 확인
  const oilGov = await p.benefit.findMany({
    where: {
      sourceCode: "GOV24",
      OR: [
        { title: { contains: "고유가" } },
        { title: { contains: "민생" } },
        { title: { contains: "유가" } },
        { title: { contains: "피해지원" } },
      ],
    },
    select: { title: true, agency: true, applyEndAt: true },
    take: 20,
  });
  console.log(`\n=== GOV24의 고유가/민생/피해지원 항목: ${oilGov.length}건 ===`);
  for (const o of oilGov)
    console.log(`  ${o.title} | agency=${o.agency} | end=${o.applyEndAt?.toISOString().slice(0, 10)}`);

  // 5. agency 분포 — 지자체 얼마나 있는지 (상위 30개)
  const agencies = await p.benefit.groupBy({
    by: ["agency"],
    where: { active: true, agency: { not: null } },
    _count: true,
    orderBy: { _count: { agency: "desc" } },
    take: 30,
  });
  console.log("\n=== 제공기관 상위 30 ===");
  for (const a of agencies) console.log(`  ${a.agency}: ${a._count}`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => p.$disconnect());
