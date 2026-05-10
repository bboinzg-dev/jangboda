// 개인정보처리방침 — 사용자 입력 데이터(영수증·프로필·푸시 토큰) 수집·이용 고지
// 한국 개인정보보호법(개정안 2023.9 시행) 기준 최소 항목만 명시.

export const metadata = {
  title: "개인정보처리방침 — 장보다",
};

export const dynamic = "force-static";
export const revalidate = 86400; // 1일 캐시

export default function PrivacyPage() {
  return (
    <article className="prose prose-sm max-w-2xl mx-auto py-6 space-y-6 text-ink-2">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-1">
          개인정보처리방침
        </h1>
        <p className="text-xs text-ink-3 mt-1">최종 업데이트: 2026-05-11</p>
      </header>

      <section>
        <h2 className="text-base font-bold text-ink-1 mb-2">
          1. 수집하는 개인정보
        </h2>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>
            <strong>계정 정보</strong>: 이메일(Supabase 인증), 닉네임
          </li>
          <li>
            <strong>영수증 이미지·OCR 텍스트</strong>: 사용자가 직접 업로드한
            영수증과 그 안의 매장명·품목·금액
          </li>
          <li>
            <strong>혜택 매칭용 프로필</strong>: 출생연도, 거주지(시/구), 가구
            형태, 소득 구간 등 사용자가 입력한 항목 (선택)
          </li>
          <li>
            <strong>푸시 토큰</strong>: 회수·혜택 마감 알림 발송용 (선택)
          </li>
          <li>
            <strong>위치 정보</strong>: "내 주변 매장" 검색 시 단말 GPS 좌표
            (서버 저장 안 함)
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-bold text-ink-1 mb-2">
          2. 이용 목적
        </h2>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>가격 비교 데이터 구축 (영수증 → 가격·매장 정보)</li>
          <li>가계부, 자주 사는 상품, 절약액 통계 제공</li>
          <li>본인 자격에 맞는 정부 혜택 추천</li>
          <li>회수·판매중지 식품 알림</li>
          <li>포인트 보상 산정</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-bold text-ink-1 mb-2">
          3. 보관 기간
        </h2>
        <ul className="list-disc pl-5 space-y-1 text-sm">
          <li>계정 유지 기간 동안 보관, 회원 탈퇴 시 즉시 파기</li>
          <li>영수증 이미지는 OCR 처리 후 90일까지 보관 (그 이후 자동 삭제)</li>
          <li>법령상 보존 의무가 있는 경우 해당 기간 동안 보관</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-bold text-ink-1 mb-2">
          4. 제3자 제공
        </h2>
        <p className="text-sm">
          개인정보를 외부에 판매하거나 제3자에게 제공하지 않습니다. 단, 다음
          처리위탁이 있습니다.
        </p>
        <ul className="list-disc pl-5 space-y-1 text-sm mt-2">
          <li>Supabase (인증·DB·이미지 저장)</li>
          <li>Vercel (웹 호스팅)</li>
          <li>Web Push (브라우저 표준) — 푸시 알림 발송</li>
        </ul>
      </section>

      <section>
        <h2 className="text-base font-bold text-ink-1 mb-2">
          5. 외부 출처 데이터 면책
        </h2>
        <p className="text-sm">
          본 서비스가 제공하는 가격(KAMIS·네이버 쇼핑·한국소비자원), 정부 혜택
          (GOV24·중소기업지원·기업마당), 회수 정보(식약처), 농수산물 이력은 모두
          공공/외부 데이터를 자동 수집한 <strong>참고 자료</strong>입니다.
          최신·정확한 정보는 반드시 해당 기관에서 직접 확인하시기 바라며,
          본 서비스의 정보를 근거로 한 신청·구매·사용 결과에 대해 운영자는
          법적 책임을 지지 않습니다.
        </p>
      </section>

      <section>
        <h2 className="text-base font-bold text-ink-1 mb-2">
          6. 사용자 권리
        </h2>
        <p className="text-sm">
          언제든지 본인 정보 조회·수정·삭제, 회원 탈퇴를 요청할 수 있습니다.
          요청은 서비스 내 프로필 메뉴 또는 운영자 이메일을 통해 접수합니다.
        </p>
      </section>

      <section>
        <h2 className="text-base font-bold text-ink-1 mb-2">
          7. 문의
        </h2>
        <p className="text-sm">
          개인정보 관련 문의: 서비스 내 문의하기 또는 운영자 이메일
        </p>
      </section>
    </article>
  );
}
