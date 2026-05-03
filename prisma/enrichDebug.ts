// enrich 디버그 — 1건씩 fetch 결과 확인
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

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 출처별 detailUrl 보유율
  for (const sc of ["BIZINFO", "MSS_BIZ", "MSS_SUPPORT"]) {
    const total = await prisma.benefit.count({ where: { sourceCode: sc, active: true } });
    const withUrl = await prisma.benefit.count({
      where: { sourceCode: sc, active: true, detailUrl: { not: null } },
    });
    console.log(`${sc}: 전체 ${total} / detailUrl 있음 ${withUrl}`);
  }

  // 각 출처에서 detailUrl 샘플 3건씩
  for (const sc of ["BIZINFO", "MSS_BIZ", "MSS_SUPPORT"]) {
    console.log(`\n=== ${sc} 샘플 ===`);
    const samples = await prisma.benefit.findMany({
      where: { sourceCode: sc, active: true },
      select: { id: true, title: true, detailUrl: true, applyUrl: true, eligibilityRules: true },
      take: 3,
    });
    for (const s of samples) {
      console.log(`  title: ${s.title.slice(0, 50)}`);
      console.log(`  detailUrl: ${s.detailUrl}`);
      console.log(`  applyUrl: ${s.applyUrl}`);
      const rules = s.eligibilityRules as Record<string, unknown> | null;
      console.log(`  rules keys: ${rules ? Object.keys(rules).join(",") : "(none)"}`);
      console.log();
    }
  }

  // 실제 fetch 테스트 — bizinfo 1건
  const sample = await prisma.benefit.findFirst({
    where: { sourceCode: "BIZINFO", active: true, detailUrl: { not: null } },
    select: { id: true, title: true, detailUrl: true },
  });
  if (sample?.detailUrl) {
    console.log(`\n=== fetch 테스트: ${sample.detailUrl} ===`);
    try {
      const res = await fetch(sample.detailUrl, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      });
      console.log(`  status: ${res.status}`);
      const text = await res.text();
      console.log(`  body length: ${text.length}`);
      // dl/dt/dd 패턴 찾기
      const dlCount = (text.match(/<dl/g) ?? []).length;
      const dtCount = (text.match(/<dt/g) ?? []).length;
      const ddCount = (text.match(/<dd/g) ?? []).length;
      console.log(`  <dl>=${dlCount}, <dt>=${dtCount}, <dd>=${ddCount}`);
      // 처음 1500자 미리보기
      console.log(`  미리보기:\n${text.slice(0, 800)}`);
    } catch (e) {
      console.log(`  fetch 실패: ${e instanceof Error ? e.message : e}`);
    }
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
