// 네이버 sync로 들어온 source="naver" 가격 모두 삭제
// → 다음 sync에서 multi-pack 필터 적용된 결과만 다시 들어감
//
// 실행: npx tsx prisma/cleanMultipackPrices.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.price.deleteMany({
    where: { source: "naver" },
  });
  console.log(`✅ source="naver" 가격 ${result.count}개 삭제 완료`);
  console.log("   다음 네이버 sync(매시간 30분 cron 또는 수동)에서");
  console.log("   multi-pack 필터 적용된 결과로 다시 채워집니다.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
