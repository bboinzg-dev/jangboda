// OCR 메타 라인이 잘못 product로 등록된 케이스 정리
// 예: "시업자:271-85-", "전화:02-..." 등 (영수증 메타 정보가 product로 오인식)
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BAD_PATTERNS = [
  "시업자",       // 사업자 OCR 오인식
  "사업자:",
  "사 업자",
  "전화:",
  "선화:",        // 전화 OCR 오인식 (전→선)
  "TEL:",
  "Tel:",
  "총 계",
  "총계:",
  "종 계",        // 총 계 OCR 오인식 (총→종)
  "종계:",
  "합 계:",
  "합계:",
  "할 인",
  "카드번호",
  "승인번호",
  "영수증번호",
  "주소:",
  "주 소:",
  "대표자",
  "신용카드:",
  "현금영수증:",
  "POS:",
  "[등록]",
  "잔여(",
  "L.POINT",
];

async function main() {
  console.log("=== 의심 product 정리 ===\n");
  let totalDeleted = 0;
  let totalPricesDeleted = 0;
  for (const pat of BAD_PATTERNS) {
    const matches = await prisma.product.findMany({
      where: { name: { contains: pat } },
      select: { id: true, name: true, _count: { select: { prices: true } } },
    });
    for (const m of matches) {
      console.log(`삭제: "${m.name}" (${m._count.prices}개 가격)`);
      // Price는 onDelete: Cascade로 자동 삭제됨
      await prisma.product.delete({ where: { id: m.id } });
      totalDeleted++;
      totalPricesDeleted += m._count.prices;
    }
  }
  console.log(`\n총 product ${totalDeleted}건, prices ${totalPricesDeleted}건 정리 완료`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
