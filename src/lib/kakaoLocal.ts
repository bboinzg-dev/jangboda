// 카카오 Local API (services.Places) 클라이언트 헬퍼
// 클라이언트(브라우저)에서만 사용. SDK가 services 라이브러리와 함께 로드되어 있어야 함.
// (SDK 로드는 src/components/KakaoStoresMap.tsx에서 처리 — libraries=services)

export type GeocodeResult = {
  address: string;
  roadAddress?: string;
  lat: number;
  lng: number;
  placeName?: string;
};

// 주소/지명 검색 → 좌표 (예: "강남역" → 37.498, 127.027)
export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  return new Promise((resolve) => {
    const maps = (window as unknown as {
      kakao?: { maps?: Record<string, unknown> & { services?: unknown } };
    }).kakao?.maps;
    if (typeof window === "undefined" || !maps?.services) {
      resolve(null);
      return;
    }
    const services = maps.services as unknown as {
      Places: new () => {
        keywordSearch: (
          q: string,
          cb: (data: Array<Record<string, string>>, status: string) => void
        ) => void;
      };
      Geocoder: new () => {
        addressSearch: (
          q: string,
          cb: (data: Array<Record<string, string>>, status: string) => void
        ) => void;
      };
      Status: { OK: string };
    };

    // 주소 형태면 Geocoder, 아니면 Places (지명/POI)
    const geocoder = new services.Geocoder();
    geocoder.addressSearch(query, (data, status) => {
      if (status === services.Status.OK && data.length > 0) {
        const r = data[0];
        resolve({
          address: r.address_name ?? "",
          roadAddress: r.road_address_name,
          lat: parseFloat(r.y),
          lng: parseFloat(r.x),
        });
        return;
      }
      // fallback to keyword search (POI/지명)
      const places = new services.Places();
      places.keywordSearch(query, (pdata, pstatus) => {
        if (pstatus === services.Status.OK && pdata.length > 0) {
          const r = pdata[0];
          resolve({
            address: r.address_name ?? "",
            roadAddress: r.road_address_name,
            placeName: r.place_name,
            lat: parseFloat(r.y),
            lng: parseFloat(r.x),
          });
        } else {
          resolve(null);
        }
      });
    });
  });
}

export type DiscoveredStore = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  category: "mart" | "convenience" | "online" | "public";
  kakaoPlaceId: string;
  chainName?: string; // 후처리에서 추정한 chain 이름
};

// 카카오 services 타입 (필요한 부분만)
type KakaoPlacesResult = {
  id: string;
  place_name: string;
  address_name: string;
  road_address_name?: string;
  phone?: string;
  x: string; // lng (string)
  y: string; // lat (string)
  category_group_name?: string;
  category_group_code?: string;
};

type KakaoStatusEnum = {
  OK: string;
  ZERO_RESULT: string;
  ERROR: string;
};

type KakaoPlacesService = {
  keywordSearch: (
    keyword: string,
    callback: (data: KakaoPlacesResult[], status: string) => void,
    options?: {
      x?: number;
      y?: number;
      radius?: number;
      category_group_code?: string;
      page?: number;
      size?: number;
    }
  ) => void;
};

// 카카오 SDK 전역 타입 확장 (KakaoStoresMap.tsx의 declare global과 호환되도록 services만 추가)
type KakaoServicesNS = {
  Places: new () => KakaoPlacesService;
  Status: KakaoStatusEnum;
};

// window.kakao.maps.services는 옵션이므로 캐스팅으로 접근
function getKakaoServices(): KakaoServicesNS | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    kakao?: { maps?: { services?: KakaoServicesNS } };
  };
  return w.kakao?.maps?.services;
}

// 마트 체인 후보 (이름 부분 매칭)
const MART_CHAINS = [
  "롯데마트",
  "이마트",
  "홈플러스",
  "킴스클럽",
  "코스트코",
  "GS더프레시",
  "농협하나로마트",
  "하나로마트",
];

// 편의점 체인 후보
const CONV_CHAINS = ["CU", "GS25", "세븐일레븐", "이마트24", "MINISTOP", "미니스톱"];

// 매장명에서 chain 이름 추출
function detectChainName(
  placeName: string,
  category: "mart" | "convenience"
): string | undefined {
  const candidates = category === "mart" ? MART_CHAINS : CONV_CHAINS;
  // 길이가 긴 것 먼저 매칭 (예: "이마트24"가 "이마트"보다 우선)
  const sorted = [...candidates].sort((a, b) => b.length - a.length);
  for (const c of sorted) {
    // 대소문자 무시
    if (placeName.toUpperCase().includes(c.toUpperCase())) {
      // "미니스톱" → "MINISTOP"으로 정규화
      if (c === "미니스톱") return "MINISTOP";
      return c;
    }
  }
  return undefined;
}

function ensureServicesReady(): KakaoServicesNS {
  if (typeof window === "undefined") {
    throw new Error("브라우저 환경이 아닙니다");
  }
  const services = getKakaoServices();
  if (!services) {
    throw new Error(
      "카카오 services 라이브러리 미로드 (SDK URL에 libraries=services 포함 필요)"
    );
  }
  return services;
}

// 한 페이지(최대 15건) 결과를 가져오는 promisified 래퍼
function keywordSearchOnce(
  query: string,
  options: {
    lat: number;
    lng: number;
    radius: number;
    category_group_code?: string;
    page?: number;
    size?: number;
  }
): Promise<KakaoPlacesResult[]> {
  return new Promise((resolve, reject) => {
    try {
      const services = ensureServicesReady();
      const places = new services.Places();
      const Status = services.Status;
      places.keywordSearch(
        query,
        (data: KakaoPlacesResult[], status: string) => {
          if (status === Status.OK) {
            resolve(data);
          } else if (status === Status.ZERO_RESULT) {
            resolve([]);
          } else {
            reject(new Error(`카카오 검색 실패: ${status}`));
          }
        },
        {
          x: options.lng,
          y: options.lat,
          radius: options.radius,
          category_group_code: options.category_group_code,
          page: options.page ?? 1,
          size: options.size ?? 15,
        }
      );
    } catch (e) {
      reject(e);
    }
  });
}

// 결과 → DiscoveredStore 변환
function toDiscoveredStore(
  r: KakaoPlacesResult,
  category: "mart" | "convenience" | "online" | "public"
): DiscoveredStore {
  const chainName =
    category === "mart" || category === "convenience"
      ? detectChainName(r.place_name, category)
      : undefined;
  return {
    name: r.place_name,
    address: r.road_address_name || r.address_name,
    lat: parseFloat(r.y),
    lng: parseFloat(r.x),
    phone: r.phone || "",
    category,
    kakaoPlaceId: r.id,
    chainName,
  };
}

// 중복 제거 (kakaoPlaceId 기준)
function dedupe(list: DiscoveredStore[]): DiscoveredStore[] {
  const map = new Map<string, DiscoveredStore>();
  for (const s of list) {
    if (!map.has(s.kakaoPlaceId)) map.set(s.kakaoPlaceId, s);
  }
  return Array.from(map.values());
}

// 핵심: 키워드로 주변 장소 검색 (페이지 1~3 합산)
export async function searchPlacesNearby(
  lat: number,
  lng: number,
  query: string,
  radius: number = 5000,
  options?: { categoryGroupCode?: string; storeCategory?: DiscoveredStore["category"] }
): Promise<DiscoveredStore[]> {
  const cat: DiscoveredStore["category"] = options?.storeCategory ?? "mart";
  const all: KakaoPlacesResult[] = [];
  // 카카오는 한 페이지 최대 15건. 최대 3페이지(45건)까지만 가져온다.
  for (let page = 1; page <= 3; page++) {
    try {
      const data = await keywordSearchOnce(query, {
        lat,
        lng,
        radius,
        category_group_code: options?.categoryGroupCode,
        page,
        size: 15,
      });
      all.push(...data);
      if (data.length < 15) break; // 마지막 페이지
    } catch (e) {
      // 페이지 단위 실패는 무시 (이미 모은 것까지 사용)
      console.warn("카카오 검색 페이지 실패:", e);
      break;
    }
  }
  return dedupe(all.map((r) => toDiscoveredStore(r, cat)));
}

// 주변 마트 검색
// "MT1" = 대형마트
export async function searchMartsNearby(
  lat: number,
  lng: number,
  radius: number = 5000
): Promise<DiscoveredStore[]> {
  // category_group_code "MT1" + 키워드 "마트" 두 번 합쳐서 정확도 향상
  const [byCode, byKeyword] = await Promise.all([
    searchPlacesNearby(lat, lng, "마트", radius, {
      categoryGroupCode: "MT1",
      storeCategory: "mart",
    }),
    searchPlacesNearby(lat, lng, "마트", radius, {
      storeCategory: "mart",
    }),
  ]);
  // 둘 다 합치고 dedupe
  const merged = dedupe([...byCode, ...byKeyword]);
  // 마트 체인이 식별된 것만 남기거나, 식별 안 되면 그래도 mart로 남김
  // (식별 실패한 것은 chainName이 undefined → 서버에서 "기타 마트" 등으로 처리)
  return merged.filter((s) => {
    // "마트"라는 단어가 들어가 있거나 chain 매칭된 것만
    return s.chainName || s.name.includes("마트");
  });
}

// 주변 편의점 검색
// "CS2" = 편의점
export async function searchConveniencesNearby(
  lat: number,
  lng: number,
  radius: number = 5000
): Promise<DiscoveredStore[]> {
  // CS2는 키워드 없이도 검색 가능하지만 keywordSearch는 키워드 필수 — "편의점"으로 검색
  const list = await searchPlacesNearby(lat, lng, "편의점", radius, {
    categoryGroupCode: "CS2",
    storeCategory: "convenience",
  });
  return list;
}
