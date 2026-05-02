# 🛒 장보다 (jangboda)

**우리 동네 마트, 어디가 제일 쌀까?**
공공 데이터 + 사용자 영수증 크라우드소싱 하이브리드 가격비교 시스템.

## 솔직한 한계 (먼저 읽어주세요)

마트 가격비교 앱은 한국에서 여러 번 시도되었고 대부분 실패했습니다.
실패 원인은 **닭과 달걀 문제** — 데이터가 없으면 사용자가 안 오고, 사용자가 없으면 데이터가 안 쌓입니다.
이 프로젝트는 그 문제를 다음 전략으로 우회합니다.

| 데이터 출처    | 커버리지        | 갱신 주기 | 합법성  | 역할        |
| -------------- | --------------- | --------- | ------- | ----------- |
| KAMIS 공공 API | 농수산물        | 매일      | ✅ 무료 | 기준 시세   |
| 소비자원 참가격 | 생필품 500여 종 | 주 1회    | ✅ 무료 | CSV 임포트  |
| 마트 전단지    | 행사 상품       | 주 1회    | ✅      | CSV 임포트  |
| 사용자 영수증  | 임의            | 즉시      | ✅      | 빈 곳 채우기 |
| 사용자 직접입력 | 임의            | 즉시      | ✅      | 보조        |

→ 첫날부터 농수산물 시세는 **자동으로 채워진 상태**로 시작.
사용자는 0에서 시작하지 않고, 빈 곳만 채우면 됩니다.

## 라이브 사이트

- **프로덕션**: https://jangboda.vercel.app
- **GitHub**: https://github.com/bboinzg-dev/jangboda

## 기술 스택

- **Next.js 14** (App Router) — 풀스택 한 프로세스
- **TypeScript + Tailwind CSS**
- **Prisma + PostgreSQL (Supabase)** — Sydney 리전, transaction pooler
- **Vercel** 배포 + **Cron** (매일 KAMIS 자동 갱신)
- **CLOVA OCR** (영수증 인식, 미설정 시 mock fallback)
- **KAMIS Open API** (농수산물 시세, 미설정 시 mock fallback)
- **네이버 쇼핑 API** (쿠팡/G마켓/SSG 등 온라인 가격)

## 설치 및 실행

```bash
cd C:\project\jangboda
npm install
cp .env.example .env
npx prisma db push
npm run db:seed
npm run dev
```

`http://localhost:3000` 접속.

## 페이지

| 경로             | 기능                                       |
| ---------------- | ------------------------------------------ |
| `/`              | 가격차 큰 상품 대시보드                    |
| `/search`        | 상품 검색                                  |
| `/products/[id]` | 매장별 가격 비교 (출처 라벨 + 신선도 표시) |
| `/cart`          | 장바구니 마트별 합계 비교                  |
| `/stores`        | 주변 마트 (위치 기반)                      |
| `/upload`        | 영수증 OCR → 자동 매칭 → 일괄 등록         |
| `/contribute`    | 가격 한 건 직접 등록                       |
| `/sync`          | KAMIS 동기화 + CSV 임포트                  |

## API

- `GET  /api/products?q=&category=` — 상품 검색
- `GET  /api/products/[id]` — 상품 상세 + 매장별 최신 가격
- `GET  /api/stores?lat=&lng=&radius=` — 매장 (거리 필터)
- `POST /api/prices` — 수동 가격 등록
- `POST /api/receipts` — 영수증 → OCR 파싱
- `PATCH /api/receipts` — 매칭 확정 → 일괄 등록
- `POST /api/cart/compare` — 장바구니 마트별 비교
- `POST /api/sync/kamis` — KAMIS 농수산물 시세 동기화
- `POST /api/sync/csv` — CSV 일괄 임포트 (참가격/전단지/자체조사 등)

## 데이터 소스 연동 가이드

### 1. KAMIS (농수산물유통공사)
- 신청: https://www.kamis.or.kr/customer/reference/openapi_list.do
- 인증키 + ID 발급 (즉시, 무료)
- `.env`에 `KAMIS_CERT_KEY`, `KAMIS_CERT_ID` 입력
- `/sync` 페이지에서 "KAMIS 가격 가져오기" 클릭
- 또는 cron으로 매일 `POST /api/sync/kamis` 호출

### 2. 한국소비자원 참가격 (price.go.kr)
- 데이터: 30여 개 대형마트의 500여 개 생필품, 주 1회 갱신
- 공공데이터포털(data.go.kr)에서 CSV 다운로드 가능
- `/sync` 페이지에서 CSV 붙여넣기 → 임포트
- 컬럼: `product, store, chain, price, category, unit`

### 3. 마트 전단지
- 각 마트 자체 앱/사이트에서 매주 PDF 전단지 공개 (공식)
- 수동으로 행사 상품 → CSV 변환 후 임포트
- 출처 라벨: `전단지_롯데`, `전단지_이마트` 등

### 4. CLOVA OCR (영수증 자동 인식)
- 신청: https://www.ncloud.com/product/aiService/ocr
- `.env`에 `CLOVA_OCR_URL`, `CLOVA_OCR_SECRET` 입력
- `src/lib/ocr.ts`의 `parseClovaResponse` 구현
- 미설정 시 자동으로 mock OCR 작동 (데모용)

## 가격 출처 라벨 (UI 표시)

가격 옆에 항상 출처 뱃지가 표시되어 사용자가 신뢰도를 판단할 수 있습니다.

- 📊 **KAMIS 시세** — 공식 농수산물 평균가
- 📋 **CSV 임포트** — 참가격/전단지 등
- 📸 **영수증** — 사용자가 영수증 OCR로 등록
- ✍️ **직접 입력** — 사용자가 매장에서 보고 입력
- 🌱 **초기 데이터** — 시드 (데모용)

## 데이터 신선도 처리

- 가격 기록은 매번 INSERT (덮어쓰지 않음 → 추이 분석 가능)
- 매장별 "최신 가격"은 `createdAt DESC LIMIT 1`로 조회
- 7일 이내: 🟢 최신 / 30일 이내: 🟡 / 그 이상: 🔴 오래됨

## DB 스키마 (요약)

- **Chain** — 마트 체인 (롯데마트, KAMIS 시세 등)
- **Store** — 개별 매장 (위경도 포함, KAMIS는 가상 매장)
- **Product** — 정규화된 상품 카탈로그
- **ProductAlias** — 매칭용 별칭 (KAMIS/OCR이 다른 표기로 와도 같은 상품에 묶임)
- **Price** — 가격 기록 (상품 × 매장 × 시점, source 라벨)
- **Receipt** — 영수증 원본 + 파싱 결과
- **User** — 닉네임 + 기여 포인트

## 운영 시 주의

- 가격 정보 자체는 사실(fact)이라 저작권 없음 → 합법
- 마트 로고/상호 사용 시 식별 목적으로만 사용 (광고 비교 광고 회색지대 주의)
- KAMIS API는 무료지만 호출 한도 있음 → 매일 1회 cron으로 충분
- 데이터 10만 건 넘어가면 SQLite → PostgreSQL 마이그레이션 권장

## 카카오맵으로 전환하기 (선택)

기본은 무료 OpenStreetMap + Leaflet. 한국 도로명/한글 라벨이 더 자연스러운 카카오맵으로 전환하려면:

1. https://developers.kakao.com/console/app 에서 애플리케이션 등록
2. 플랫폼 → Web에 도메인 등록 (`https://jangboda.vercel.app`, `http://localhost:3000`)
3. 발급받은 **JavaScript 키**를 환경변수로 추가:
   ```
   NEXT_PUBLIC_KAKAO_MAP_APP_KEY="your_javascript_key_here"
   ```
4. `npm run build` (NEXT_PUBLIC_*는 빌드 타임 inline) → 자동으로 카카오맵 전환됨

키 미설정이면 OpenStreetMap이 그대로 작동합니다.

## 보안 노트

- `/api/sync/*` 엔드포인트는 환경변수 `SYNC_TOKEN` 설정 시 인증 필요
  (헤더 `X-Sync-Token` 또는 `?token=`)
- Vercel Cron은 `CRON_SECRET` 환경변수로 자동 인증 (Bearer)
- DB 비밀번호 회전: Supabase Dashboard → Settings → Database → Reset password
- 비번 회전 후 Vercel 환경변수(`DATABASE_URL`, `DIRECT_URL`)도 같이 업데이트

## 자동화 (Vercel Cron)

`vercel.json`에 정의된 스케줄:

- 매일 16:00 (UTC) — KAMIS 농수산물 시세 자동 갱신
- 매주 월요일 17:00 (UTC) — 네이버 쇼핑 메이저몰 가격 갱신

## 다음 단계

- [ ] 카카오맵 SDK로 매장 지도 시각화
- [ ] 사용자 인증 (Supabase Auth)
- [ ] 단위 정규화 (1L vs 1000ml, 100g vs 0.1kg)
- [ ] PWA 변환 (모바일 홈 추가, 카메라 영수증 즉시 업로드)
- [ ] 가격 알림 ("우유 3000원 이하 되면 알려줘")
- [ ] 가격 이상치 자동 탐지 강화
