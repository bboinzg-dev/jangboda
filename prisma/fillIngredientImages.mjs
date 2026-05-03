// 단독 원물 product (당근/양배추/배추 등) 이미지를 Wikipedia API로 채움
// Naver는 잡화 매칭이라 못 씀 → 한국어 위키피디아 article의 대표 이미지(원본) 사용
// Wikimedia Commons는 CC 라이선스라 직접 hotlink 가능
//
// 실행: node prisma/fillIngredientImages.mjs
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// product.name → 위키피디아 검색어 매핑
// 괄호 안 부가설명("(흙당근, 100g)") 제거 + 핵심 단어만
function toWikiTitle(name) {
  let core = name
    .replace(/\([^)]*\)/g, "")
    .replace(/\d+(\.\d+)?\s*(kg|g|ml|L)/gi, "")
    .trim();
  // 다단어면 첫 단어만 (예: "돼지고기 삼겹살" → "돼지고기")
  // 단, 알려진 복합어는 그대로 (한우, 갈치 등은 단일어)
  const compound = ["돼지고기", "한우", "닭고기", "소고기"];
  for (const c of compound) {
    if (core.startsWith(c)) {
      core = c;
      break;
    }
  }
  // 첫 단어 선택
  const firstWord = core.split(/[\s,]/)[0];
  return firstWord;
}

async function fetchWikiImage(title) {
  const url = `https://ko.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&piprop=original&pithumbsize=600`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "jangboda/1.0 (bboinzg@gmail.com)" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const pages = json?.query?.pages ?? {};
    for (const pageId of Object.keys(pages)) {
      if (pageId === "-1") return null; // 페이지 없음
      const original = pages[pageId]?.original?.source;
      if (original) return original;
      const thumb = pages[pageId]?.thumbnail?.source;
      if (thumb) return thumb;
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  // imageUrl null인 product 중 단독 원물(brand=null + 짧은 이름) 후보
  const candidates = await prisma.product.findMany({
    where: { imageUrl: null, brand: null },
    select: { id: true, name: true, category: true },
  });
  console.log(`처리 대상: ${candidates.length}건`);

  let filled = 0;
  let failed = 0;
  for (const p of candidates) {
    const title = toWikiTitle(p.name);
    if (!title || title.length < 1) {
      failed++;
      continue;
    }

    const imageUrl = await fetchWikiImage(title);
    if (imageUrl) {
      await prisma.product.update({
        where: { id: p.id },
        data: { imageUrl },
      });
      console.log(`  ✓ ${p.name} (${title}): ${imageUrl.slice(0, 70)}`);
      filled++;
    } else {
      console.log(`  - ${p.name} (${title}): wiki 없음`);
      failed++;
    }

    // Wikipedia API rate limit 친화적으로 200ms 대기
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n총 ${filled}건 채움, ${failed}건 실패`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
