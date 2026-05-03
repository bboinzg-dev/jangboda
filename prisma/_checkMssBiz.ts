import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  } catch {}
}
loadEnv();

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const total = await prisma.benefit.count({
    where: { sourceCode: "MSS_BIZ", active: true },
  });
  const sample = await prisma.benefit.findMany({
    where: { sourceCode: "MSS_BIZ", active: true },
    select: { id: true, title: true, eligibilityRules: true },
    take: 3,
  });
  let withGaeyo = 0;
  let withMunui = 0;
  let withGongo = 0;
  const all = await prisma.benefit.findMany({
    where: { sourceCode: "MSS_BIZ", active: true },
    select: { eligibilityRules: true },
  });
  for (const r of all) {
    const er = (r.eligibilityRules ?? {}) as Record<string, unknown>;
    if (typeof er["사업개요"] === "string" && (er["사업개요"] as string).length >= 10) withGaeyo++;
    if (typeof er["문의처"] === "string" && (er["문의처"] as string).length >= 3) withMunui++;
    if (typeof er["공고번호"] === "string") withGongo++;
  }
  console.log(`MSS_BIZ 총 ${total}건`);
  console.log(`  사업개요 채워짐: ${withGaeyo}건`);
  console.log(`  문의처 채워짐: ${withMunui}건`);
  console.log(`  공고번호 채워짐: ${withGongo}건 (detailUrl fetch 성공 표지)`);
  console.log("\n샘플 3건:");
  for (const s of sample) {
    console.log("\n---");
    console.log("title:", s.title.slice(0, 50));
    console.log("rules:", JSON.stringify(s.eligibilityRules, null, 2).slice(0, 600));
  }
  await prisma.$disconnect();
}

main();
