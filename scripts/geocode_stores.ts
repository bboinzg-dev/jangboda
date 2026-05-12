// 좌표 없는 매장(lat=0,lng=0)을 Nominatim(OSM)으로 백필.
//
// 참가격 API가 매장 84%에 좌표를 안 줘서 stores 페이지가 절반밖에 동작 안 함.
// 카카오 REST 키 없이 무료로 가능한 Nominatim 사용.
// - 호출 한도: 1 req/sec (User-Agent 필수)
// - 한국 도로명 주소는 보통 잘 매칭됨
//
// 사용:
//   DRY_RUN=1 npx tsx scripts/geocode_stores.ts        # 미리보기 (10개만)
//   SAMPLE=50 npx tsx scripts/geocode_stores.ts        # 50개만 시도
//   npx tsx scripts/geocode_stores.ts                   # 전체

import { PrismaClient } from "@prisma/client";
import { setTimeout as sleep } from "timers/promises";

const prisma = new PrismaClient();
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "jangboda/1.0 (https://jangboda.vercel.app)";
const RATE_MS = 1100; // Nominatim 정책: 1 req/sec 권장 — 마진 포함 1.1초

const DRY_RUN = process.env.DRY_RUN === "1";
const SAMPLE = parseInt(process.env.SAMPLE ?? "0", 10);

type GeoResult = { lat: number; lng: number; matchedAddress: string };

// Nominatim이 잘 못 알아먹는 꼬리표 제거 — "1층", "지하 1층", "B1", "(동XX)" 등
function normalizeAddress(addr: string): string {
  return addr
    .replace(/\s+\d+층(\s|$)/g, " ")
    .replace(/\s+(지하|지상)\s*\d*층?(\s|$)/g, " ")
    .replace(/\s+B\d+(\s|$)/gi, " ")
    .replace(/\s+\(.+?\)(\s|$)/g, " ") // 괄호 부가정보
    .replace(/\s+/g, " ")
    .trim();
}

async function geocodeNominatim(address: string): Promise<GeoResult | null> {
  const url = `${NOMINATIM}?format=json&q=${encodeURIComponent(address)}&countrycodes=kr&limit=1`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, matchedAddress: data[0].display_name };
  } catch {
    return null;
  }
}

async function main() {
  // 좌표 없는 매장 — 주소 비어있는 row와 온라인 매장은 어차피 못 함
  const targets = await prisma.store.findMany({
    where: {
      lat: 0,
      lng: 0,
      address: { not: "주소 미상" },
      NOT: { address: { contains: "온라인" } },
    },
    select: { id: true, name: true, address: true },
    orderBy: { name: "asc" },
  });

  const slice = SAMPLE > 0 ? targets.slice(0, SAMPLE) : DRY_RUN ? targets.slice(0, 10) : targets;

  console.log(`전체 대상: ${targets.length}개 / 이번 실행: ${slice.length}개${DRY_RUN ? "  (DRY RUN)" : ""}`);
  console.log(`예상 소요: ${Math.ceil((slice.length * RATE_MS) / 1000 / 60)}분\n`);

  let filled = 0;
  let notFound = 0;
  let skipped = 0;

  for (let i = 0; i < slice.length; i++) {
    const s = slice[i];
    if (!s.address) {
      skipped++;
      continue;
    }

    const r = await geocodeNominatim(normalizeAddress(s.address));
    if (r) {
      // 한국 영역(대략 33-39°N, 125-132°E) 검증 — 주소 매칭이 엉뚱한 곳 잡는 경우 거름
      const inKorea = r.lat >= 33 && r.lat <= 39 && r.lng >= 125 && r.lng <= 132;
      if (!inKorea) {
        console.log(`  [${i + 1}] ${s.name}  ⚠️ 한국 밖 좌표 (${r.lat}, ${r.lng}) — 스킵`);
        skipped++;
      } else {
        if (!DRY_RUN) {
          await prisma.store.update({
            where: { id: s.id },
            data: { lat: r.lat, lng: r.lng },
          });
        }
        filled++;
        if ((i + 1) % 20 === 0 || i < 5 || DRY_RUN) {
          console.log(
            `  [${i + 1}/${slice.length}] ✓ ${s.name}  →  ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}`
          );
        }
      }
    } else {
      notFound++;
      if (notFound <= 3) console.log(`  [${i + 1}] ${s.name}  ✗ 매칭 실패  (${s.address})`);
    }

    if (i < slice.length - 1) await sleep(RATE_MS);
  }

  console.log("\n=== 결과 ===");
  console.log(`  채움    : ${filled}`);
  console.log(`  미매칭  : ${notFound}`);
  console.log(`  스킵    : ${skipped}`);
}

main().finally(() => prisma.$disconnect());
