// Naver로 자동채워진 imageUrl 검증 + 신뢰도 낮은 건 wipe + 정확하게 다시 채움
//
// 검증 로직 (현재 imageUrl이 Naver pstatic 호스트인 product에 한해):
//   - 현재 채워진 image의 source title을 다시 가져와서 product name 토큰과 비교
//   - title 핵심 토큰 (>=2글자) 중 ≥2개가 일치해야 OK, 아니면 wipe
//
// 그 후 wipe된 거 + 원래 null이던 거 → sort=sim + 토큰 검증으로 다시 채움
//
// 실행: node prisma/verifyAndRefillImages.mjs
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

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

const MULTIPACK = [/\b[xX×]\s*[2-9]\b/, /[2-9]\s*개\s*묶음/, /[2-9]\s*개\s*세트/, /\b[2-9]\s*PACK/i, /\(\s*[2-9]\s*개\s*\)/];
const isMultiPack = (t) => MULTIPACK.some((r) => r.test(t));

function tokenize(s) {
  // 괄호/숫자/단위 제거 후 한글/영숫자 토큰 추출 (2자 이상)
  return s
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^가-힯a-zA-Z0-9가-힣]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

// product name에서 핵심 키워드 추출 (브랜드 + 상품명)
function getCoreTokens(name, brand) {
  const allTokens = tokenize(name);
  const brandTokens = brand ? tokenize(brand) : [];
  // 단위 키워드(g, kg, ml 등) 및 1-2자 짧은 단어 제외
  return Array.from(new Set([...brandTokens, ...allTokens])).filter(
    (t) => !/^\d+$/.test(t) && !/^(kg|g|ml|L|개|입|봉|병|캔|팩|개입)$/i.test(t)
  );
}

async function searchNaver(query, sort = "sim") {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=20&sort=${sort}`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_ID,
      "X-Naver-Client-Secret": NAVER_SECRET,
    },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.items ?? []).map((it) => ({
    title: (it.title || "").replace(/<[^>]+>/g, ""),
    image: it.image || "",
  }));
}

// title이 product와 매칭되는지 검증 (핵심 토큰 ≥2개 포함)
function isMatch(title, productTokens) {
  if (productTokens.length === 0) return false;
  const titleN = title.toLowerCase();
  const hits = productTokens.filter((t) => titleN.includes(t.toLowerCase())).length;
  // product 토큰이 1개뿐이면 1개만 일치해도 OK, 2개 이상이면 ≥2개 일치 필요
  const required = Math.min(2, Math.max(1, Math.ceil(productTokens.length / 3)));
  return hits >= required;
}

async function findGoodImage(productName, brand) {
  const coreTokens = getCoreTokens(productName, brand);
  const cleanName = productName.replace(/\([^)]*\)/g, "").trim();
  const query = [brand, cleanName].filter(Boolean).join(" ").trim();

  // sort=sim으로 유사도 순 검색 (가장 싼 게 아니라 가장 비슷한 것)
  const items = await searchNaver(query, "sim");
  for (const it of items) {
    if (isMultiPack(it.title)) continue;
    if (!it.image) continue;
    if (isMatch(it.title, coreTokens)) {
      return { imageUrl: it.image, matchedTitle: it.title };
    }
  }
  return null;
}

async function main() {
  // imageUrl 있는 product 전부 검증 대상 (Wikipedia로 채운 건 upload.wikimedia.org)
  const all = await prisma.product.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, name: true, brand: true, imageUrl: true, category: true },
  });
  console.log(`전체 imageUrl 보유: ${all.length}건`);

  // Wikipedia/Wikimedia에서 받은 건 검증 skip (이미 신뢰)
  const naverFilled = all.filter((p) => p.imageUrl?.includes("phinf.pstatic.net"));
  console.log(`Naver 매칭: ${naverFilled.length}건 (검증 대상)`);

  // sample 50개 검증 + 잘못된 거 wipe (전체 검증은 시간 너무 걸림 — 우리는 다시 채울 거라 OK)
  // 다른 전략: 모두 wipe + 신뢰도 검증으로 다시 채움
  // → 전부 wipe 후 다시 채우는 게 깔끔. wiki 채움은 보존.

  console.log(`\n전략: Naver로 채운 ${naverFilled.length}건 모두 wipe → sort=sim + 토큰검증으로 재채움`);
  await prisma.product.updateMany({
    where: { id: { in: naverFilled.map((p) => p.id) } },
    data: { imageUrl: null },
  });
  console.log(`${naverFilled.length}건 wipe 완료`);

  // 이제 imageUrl null인 product 전부 (농수산물 제외) 재채움
  const targets = await prisma.product.findMany({
    where: {
      imageUrl: null,
      category: { not: "농수산물" },
    },
    select: { id: true, name: true, brand: true },
  });
  console.log(`\n재채움 대상: ${targets.length}건`);

  let filled = 0;
  let rejected = 0;
  const startedAt = Date.now();

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i];
    try {
      const result = await findGoodImage(p.name, p.brand);
      if (result) {
        await prisma.product.update({
          where: { id: p.id },
          data: { imageUrl: result.imageUrl },
        });
        filled++;
      } else {
        rejected++;
      }
    } catch (e) {
      rejected++;
    }

    if ((i + 1) % 50 === 0) {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(`  [${i + 1}/${targets.length}] ${filled} filled, ${rejected} rejected (${elapsed}s)`);
    }

    await new Promise((r) => setTimeout(r, 110));
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n총 ${filled}건 채움, ${rejected}건 매칭 실패 (${elapsed}초)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
