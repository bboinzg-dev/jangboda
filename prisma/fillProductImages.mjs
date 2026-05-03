// imageUrl 없는 product를 Naver 쇼핑 검색으로 빠르게 채움
// (sync route는 price insert까지 해서 느림 — 여기는 image만)
//
// 실행: node prisma/fillProductImages.mjs
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

// .env 파일 로드 (dotenv 없이 간단히)
const envText = readFileSync(".env", "utf-8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"\n]*)"?$/);
  if (m) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();
const NAVER_ID = process.env.NAVER_SHOP_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_SHOP_CLIENT_SECRET;

if (!NAVER_ID || !NAVER_SECRET) {
  console.error("NAVER_SHOP_CLIENT_ID/SECRET 미설정");
  process.exit(1);
}

const MULTIPACK = [
  /\b[xX×]\s*[2-9]\b/,
  /[2-9]\s*개\s*묶음/,
  /[2-9]\s*개\s*세트/,
  /\b[2-9]\s*PACK/i,
  /\(\s*[2-9]\s*개\s*\)/,
];
const isMultiPack = (t) => MULTIPACK.some((r) => r.test(t));

async function searchNaver(query) {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=10&sort=asc`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_ID,
      "X-Naver-Client-Secret": NAVER_SECRET,
    },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const items = json.items ?? [];
  for (const it of items) {
    const title = (it.title || "").replace(/<[^>]+>/g, "");
    if (isMultiPack(title)) continue;
    if (it.image) return it.image;
  }
  return null;
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      imageUrl: null,
      category: { not: "농수산물" },
    },
    select: { id: true, name: true, brand: true, unit: true },
  });
  console.log(`처리 대상: ${products.length}개`);

  let filled = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const cleanName = p.name.replace(/\([^)]*\)/g, "").trim();
    const query = [p.brand, cleanName].filter(Boolean).join(" ").trim();

    try {
      const imageUrl = await searchNaver(query);
      if (imageUrl) {
        await prisma.product.update({
          where: { id: p.id },
          data: { imageUrl },
        });
        filled++;
        if (filled % 20 === 0) {
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
          console.log(`  [${i + 1}/${products.length}] ${filled} filled, ${failed} failed (${elapsed}s)`);
        }
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
      console.warn(`  ✗ ${p.name}: ${e.message}`);
    }

    // Naver API rate limit: 초당 10건 제한 → 100ms 대기
    await new Promise((r) => setTimeout(r, 110));
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n총 ${filled}개 imageUrl 채움, ${failed}개 실패 (${elapsed}초)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
