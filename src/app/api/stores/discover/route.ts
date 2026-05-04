import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/stores/discover
// body: { stores: DiscoveredStore[] }
// 카카오 Local에서 발견된 매장을 chain 매칭 후 DB에 upsert.

type DiscoveredStore = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  category: "mart" | "convenience" | "online" | "public";
  kakaoPlaceId: string;
  chainName?: string;
};

// 매장 이름에서 chain 후보 키워드 추출 (서버측 안전장치)
const MART_KEYWORDS = [
  "롯데마트",
  "이마트",
  "홈플러스",
  "킴스클럽",
  "코스트코",
  "GS더프레시",
  "농협하나로마트",
  "하나로마트",
];
const CONV_KEYWORDS = ["CU", "GS25", "세븐일레븐", "이마트24", "MINISTOP", "미니스톱"];

function pickChainName(
  storeName: string,
  category: DiscoveredStore["category"],
  fromClient?: string
): string {
  if (fromClient) return fromClient;
  const upper = storeName.toUpperCase();
  if (category === "mart") {
    const sorted = [...MART_KEYWORDS].sort((a, b) => b.length - a.length);
    for (const k of sorted) {
      if (upper.includes(k.toUpperCase())) return k;
    }
    return "기타 마트";
  }
  if (category === "convenience") {
    const sorted = [...CONV_KEYWORDS].sort((a, b) => b.length - a.length);
    for (const k of sorted) {
      if (upper.includes(k.toUpperCase())) {
        return k === "미니스톱" ? "MINISTOP" : k;
      }
    }
    return "기타 편의점";
  }
  return "기타";
}

// 위도/경도가 거의 동일하면 같은 매장으로 본다 (~10m 정도)
const COORD_EPS = 0.0001;

export async function POST(req: NextRequest) {
  let body: { stores?: DiscoveredStore[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 JSON" }, { status: 400 });
  }
  const incoming = Array.isArray(body.stores) ? body.stores : [];
  if (incoming.length === 0) {
    return NextResponse.json({ ok: true, created: 0, existing: 0 });
  }

  // 사전에 필요한 chain들 미리 캐싱 (한 번만 조회)
  const chains = await prisma.chain.findMany();
  const chainByName = new Map(chains.map((c) => [c.name, c]));

  let created = 0;
  let existing = 0;

  for (const s of incoming) {
    if (!s.name || !s.address || !isFinite(s.lat) || !isFinite(s.lng)) continue;

    // 1. chain 결정
    const chainName = pickChainName(s.name, s.category, s.chainName);
    let chain = chainByName.get(chainName);
    if (!chain) {
      // chain 없으면 생성
      chain = await prisma.chain.create({
        data: {
          name: chainName,
          category: s.category,
        },
      });
      chainByName.set(chainName, chain);
    }

    // 2. 같은 매장 이미 있는지 확인
    //   - 좌표가 거의 같고 같은 chain이면 동일
    //   - 또는 이름 + 주소 정확히 일치
    const candidates = await prisma.store.findMany({
      where: {
        chainId: chain.id,
        AND: [
          { lat: { gte: s.lat - COORD_EPS, lte: s.lat + COORD_EPS } },
          { lng: { gte: s.lng - COORD_EPS, lte: s.lng + COORD_EPS } },
        ],
      },
      take: 1,
    });

    if (candidates.length > 0) {
      existing++;
      continue;
    }

    // 이름+주소 완전일치 추가 검사
    const nameAddrMatch = await prisma.store.findFirst({
      where: {
        chainId: chain.id,
        name: s.name,
        address: s.address,
      },
    });
    if (nameAddrMatch) {
      existing++;
      continue;
    }

    // 정규화된 이름+주소 매칭 (공백/특수문자 차이로 중복되는 케이스 방지)
    // ex: "GS25 힐데스하임점" vs "GS25힐데스하임점" 같은 케이스
    const normName = s.name.replace(/\s+/g, "").toLowerCase();
    const normAddr = s.address.replace(/\s+/g, "").toLowerCase();
    const sameChainStores = await prisma.store.findMany({
      where: { chainId: chain.id },
      select: { id: true, name: true, address: true },
    });
    const normMatch = sameChainStores.find(
      (st) =>
        st.name.replace(/\s+/g, "").toLowerCase() === normName &&
        st.address.replace(/\s+/g, "").toLowerCase() === normAddr
    );
    if (normMatch) {
      existing++;
      continue;
    }

    // 3. 신규 생성
    await prisma.store.create({
      data: {
        chainId: chain.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        phone: s.phone || null,
      },
    });
    created++;
  }

  return NextResponse.json({ ok: true, created, existing });
}
