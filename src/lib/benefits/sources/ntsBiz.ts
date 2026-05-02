// 출처: 국세청 사업자등록정보 진위확인/상태조회 / 엔드포인트: https://api.odcloud.kr/api/nts-businessman/v1/status / 갱신주기: 실시간
// 카탈로그가 아니라 자격 검증용. 사업자등록번호로 휴/폐업 여부를 조회.

const BASE_URL = "https://api.odcloud.kr/api/nts-businessman/v1/status";

interface NtsStatusItem {
  b_no?: string;
  b_stt?: string; // "계속사업자" / "휴업자" / "폐업자"
  b_stt_cd?: string; // "01" / "02" / "03"
  tax_type?: string;
  tax_type_cd?: string;
  end_dt?: string; // 폐업일 YYYYMMDD
  rbf_tax_type?: string;
  rbf_tax_type_cd?: string;
}

interface NtsStatusResponse {
  status_code?: string;
  match_cnt?: number;
  request_cnt?: number;
  data?: NtsStatusItem[];
}

// 사업자번호에서 숫자만 추출
function normalizeBNo(bNo: string): string {
  return bNo.replace(/[^0-9]/g, "");
}

export async function verifyBusinessRegistration(
  bNo: string,
): Promise<{ valid: boolean; status?: string; raw?: unknown }> {
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error("DATA_GO_KR_SERVICE_KEY 환경변수가 설정되지 않았습니다.");
  }

  const normalized = normalizeBNo(bNo);
  if (normalized.length !== 10) {
    throw new Error(`유효하지 않은 사업자등록번호 형식: ${bNo} (10자리 숫자가 아님)`);
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("returnType", "JSON");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ b_no: [normalized] }),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`NTS 사업자 상태조회 실패: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as NtsStatusResponse;
  const item = json.data?.[0];

  // 등록되지 않은 사업자번호: data가 비었거나 b_stt_cd가 없음
  if (!item || !item.b_stt_cd) {
    return { valid: false, status: "미등록", raw: json };
  }

  // 계속사업자(01)만 valid. 휴업(02)/폐업(03)은 valid: false.
  const valid = item.b_stt_cd === "01";

  return {
    valid,
    status: item.b_stt,
    raw: json,
  };
}
