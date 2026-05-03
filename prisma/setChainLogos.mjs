// Chain.logoUrl 일괄 업데이트 — Wikimedia Commons에서 직접 다운로드한
// public/logos/ 의 로고 파일을 chain name 기준으로 매핑.
//
// 실행: npx tsx prisma/setChainLogos.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 다운로드 성공한 로고만 매핑 (실패한 chain은 logoUrl 그대로 null 유지)
// SVG가 가벼우면 SVG, 일부는 원본이 PNG 형식인 경우 PNG.
const LOGO_MAP = {
  // 대형마트
  "이마트": "/logos/emart.svg",
  "이마트24": "/logos/emart24.svg",
  "롯데마트": "/logos/lottemart.svg",
  "홈플러스": "/logos/homeplus.png",
  "코스트코": "/logos/costco.svg",
  // 편의점
  "GS25": "/logos/gs25.svg",
  "CU": "/logos/cu.svg",
  "세븐일레븐": "/logos/sevenelevenkr.svg",
  "미니스톱": "/logos/ministop.svg",
  // 백화점
  "현대백화점": "/logos/hyundai.svg",
  "신세계백화점": "/logos/shinsegae.svg",
  // Wikimedia에 없어 자체 placeholder SVG로 대체한 chain
  "트레이더스": "/logos/traders.svg",
  "이마트에브리데이": "/logos/emart-everyday.svg",
  "롯데슈퍼": "/logos/lotte-super.svg",
  "롯데백화점": "/logos/lotte-dept.svg",
  "GS더프레시": "/logos/gs-fresh.svg",
  "킴스클럽": "/logos/kims-club.svg",
  "농협하나로마트": "/logos/nh-haneoro.svg",
  "홈플러스 익스프레스": "/logos/homeplus-express.svg",
};

async function main() {
  let updated = 0;
  let skipped = 0;

  for (const [name, url] of Object.entries(LOGO_MAP)) {
    const result = await prisma.chain.updateMany({
      where: { name },
      data: { logoUrl: url },
    });
    if (result.count > 0) {
      console.log(`  ✓ ${name} → ${url} (${result.count}건 업데이트)`);
      updated += result.count;
    } else {
      console.log(`  - ${name} → DB에 없음 (skip)`);
      skipped += 1;
    }
  }

  console.log(`\n총 ${updated}개 chain logoUrl 업데이트, ${skipped}개 chain DB에 없음`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
