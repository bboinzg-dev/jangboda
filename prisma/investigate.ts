// 일회성 진단 — 특정 혜택의 DB 상태 확인
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
const p = new PrismaClient();

async function main() {
  const items = await p.benefit.findMany({
    where: {
      OR: [
        { title: { contains: "상생페이백" } },
        { title: { contains: "상생 페이백" } },
        { title: { contains: "페이백" } },
        { title: { contains: "상생" } },
      ],
    },
    select: {
      id: true,
      sourceCode: true,
      title: true,
      agency: true,
      applyStartAt: true,
      applyEndAt: true,
      active: true,
      lastSyncedAt: true,
      eligibilityRules: true,
      normalizedRules: true,
      detailUrl: true,
    },
    take: 10,
  });

  console.log(`발견: ${items.length}건`);
  for (const item of items) {
    console.log(`\n──────────────────`);
    console.log(`[${item.sourceCode}] ${item.title}`);
    console.log(`  agency: ${item.agency}`);
    console.log(`  active: ${item.active}`);
    console.log(`  applyStartAt: ${item.applyStartAt?.toISOString().slice(0, 10) ?? "null"}`);
    console.log(`  applyEndAt: ${item.applyEndAt?.toISOString().slice(0, 10) ?? "null"}`);
    console.log(`  lastSyncedAt: ${item.lastSyncedAt.toISOString().slice(0, 10)}`);
    console.log(`  detailUrl: ${item.detailUrl}`);
    const rules = item.eligibilityRules as Record<string, unknown> | null;
    console.log(`  eligibilityRules keys: ${rules ? Object.keys(rules).join(", ") : "(none)"}`);
    if (rules) {
      for (const [k, v] of Object.entries(rules)) {
        const text = typeof v === "string" ? v : JSON.stringify(v);
        console.log(`    ${k}: ${text.slice(0, 200)}`);
      }
    }
    const norm = item.normalizedRules as Record<string, unknown> | null;
    console.log(`  normalizedRules: ${norm ? JSON.stringify(norm) : "(none)"}`);
  }
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
