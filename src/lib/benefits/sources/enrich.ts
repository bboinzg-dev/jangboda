// 출처별 본문(자유텍스트) 보강 모듈.
//
// 배경:
//   bizinfo / mssBiz / mssSupport는 list API에 메타데이터(제목/URL/기관/기간)만 있고
//   "지원대상 / 선정기준 / 지원내용 / 신청방법" 같은 본문 자유텍스트가 비어있어
//   LLM 정형화 단계가 스킵된다. 이 파일은 각 출처의 detailUrl을 fetch해서
//   본문을 추출하고 BenefitRaw.eligibilityRules에 표준 키로 채워준다.
//
// 규칙:
//   - 외부 dependency 추가 금지 (정규식 + stripHtml만 사용)
//   - 5초 fetch 타임아웃 + try/catch — 실패 시 throw 금지, 원본 item 그대로 반환
//   - 호출 사이 sleep으로 rate limit 회피 (호출자가 enrich 사이 sleep 호출)
//   - 기존 eligibilityRules의 동일 키는 보존 (덮어쓰지 않음)

import { stripHtml } from "../sanitize";
import { SOURCE_CODES, type BenefitRaw } from "../types";

// 보강 후 채워질 표준 본문 키들. 모두 string | undefined.
export const ENRICH_KEYS = [
  "지원대상",
  "선정기준",
  "지원내용",
  "신청방법",
  "사업개요",
  "문의처",
] as const;
export type EnrichKey = (typeof ENRICH_KEYS)[number];

// 라벨 동의어 — 정부 공고는 같은 의미를 다양한 라벨로 적는다.
// 정규화 후 표준 키로 매핑한다.
const LABEL_ALIASES: Record<string, EnrichKey> = {
  // 지원대상
  지원대상: "지원대상",
  신청대상: "지원대상",
  신청자격: "지원대상",
  지원자격: "지원대상",
  대상: "지원대상",
  // 선정기준
  선정기준: "선정기준",
  심사기준: "선정기준",
  평가기준: "선정기준",
  // 지원내용
  지원내용: "지원내용",
  지원규모: "지원내용",
  지원금액: "지원내용",
  사업내용: "지원내용",
  // 신청방법
  신청방법: "신청방법",
  사업신청방법: "신청방법",
  접수방법: "신청방법",
  제출방법: "신청방법",
  접수처: "신청방법",
  // 사업개요
  사업개요: "사업개요",
  사업목적: "사업개요",
  공고개요: "사업개요",
  // 문의처
  문의처: "문의처",
  문의: "문의처",
  담당자: "문의처",
  문의사항: "문의처",
};

// 표준 키 6종을 빈 객체로 초기화 후 추출 결과로 채운다.
function emptyExtract(): Record<EnrichKey, string | undefined> {
  return {
    지원대상: undefined,
    선정기준: undefined,
    지원내용: undefined,
    신청방법: undefined,
    사업개요: undefined,
    문의처: undefined,
  };
}

// 라벨 텍스트에서 공백/특수문자(·, ㆍ, 등)를 제거 후 alias 매핑.
function normalizeLabel(raw: string): EnrichKey | undefined {
  const cleaned = raw.replace(/[\s·ㆍ\.:,()\[\]·]/g, "");
  return LABEL_ALIASES[cleaned];
}

// AbortController 기반 5초 타임아웃 fetch. 실패 시 undefined 반환 (throw 금지).
async function safeFetch(url: string, timeoutMs = 5000): Promise<string | undefined> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        // 기업마당이 user-agent 없는 요청을 차단할 수 있어 일반 브라우저 UA 위장
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return undefined;
    return await res.text();
  } catch {
    return undefined;
  }
}

// HTML에서 <dl><dt>라벨</dt><dd>값</dd></dl> 패턴을 모두 추출.
// 라벨 정규화 후 표준 키에 매핑되는 것만 결과에 보존.
function extractDlDt(html: string): Record<EnrichKey, string | undefined> {
  const out = emptyExtract();
  const re = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const labelRaw = stripHtml(m[1]);
    const valueRaw = stripHtml(m[2]);
    if (!labelRaw || !valueRaw) continue;
    const key = normalizeLabel(labelRaw);
    if (!key) continue;
    // 첫 매칭 우선 — 같은 키가 여러 번 나오면 첫 번째만 보존
    if (!out[key]) out[key] = valueRaw;
  }
  return out;
}

// HTML에서 <table>의 <th>라벨</th><td>값</td> 패턴을 추출.
// 일부 정부 공고 페이지는 dl 대신 표 형식을 사용한다.
function extractThTd(html: string): Record<EnrichKey, string | undefined> {
  const out = emptyExtract();
  const re = /<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const labelRaw = stripHtml(m[1]);
    const valueRaw = stripHtml(m[2]);
    if (!labelRaw || !valueRaw) continue;
    const key = normalizeLabel(labelRaw);
    if (!key) continue;
    if (!out[key]) out[key] = valueRaw;
  }
  return out;
}

// 두 추출 결과를 머지 — a 우선, 빈 키만 b에서 채움
function mergeExtracts(
  a: Record<EnrichKey, string | undefined>,
  b: Record<EnrichKey, string | undefined>,
): Record<EnrichKey, string | undefined> {
  const out = { ...a };
  for (const k of ENRICH_KEYS) {
    if (!out[k] && b[k]) out[k] = b[k];
  }
  return out;
}

// HTML 한 덩어리에서 본문 자유텍스트 추출 (dl 우선, table 폴백)
function extractFromHtml(html: string): Record<EnrichKey, string | undefined> {
  const dl = extractDlDt(html);
  const tbl = extractThTd(html);
  return mergeExtracts(dl, tbl);
}

// 추출 결과를 item.eligibilityRules에 병합.
// 이미 같은 키가 있으면 보존(덮어쓰지 않음).
function applyExtract(
  item: BenefitRaw,
  extract: Record<EnrichKey, string | undefined>,
): BenefitRaw {
  const rules = { ...(item.eligibilityRules ?? {}) };
  let touched = false;
  for (const k of ENRICH_KEYS) {
    const v = extract[k];
    if (!v) continue;
    if (rules[k] != null && rules[k] !== "") continue;
    rules[k] = v;
    touched = true;
  }
  if (!touched) return item;
  return { ...item, eligibilityRules: rules };
}

// ────────────────────────────────────────────────
// 출처별 enrich
// ────────────────────────────────────────────────

// 기업마당: detailUrl(pblancUrl)이 가리키는 상세페이지를 크롤링.
// 페이지는 dl/dt/dd 구조로 라벨(소관부처·지자체, 신청기간, 사업개요, 사업신청 방법, 문의처…)이 박혀있음.
export async function enrichBizinfo(item: BenefitRaw): Promise<BenefitRaw> {
  if (item.sourceCode !== SOURCE_CODES.BIZINFO) return item;
  if (!item.detailUrl) return item;
  const html = await safeFetch(item.detailUrl);
  if (!html) return item;
  const extract = extractFromHtml(html);
  return applyExtract(item, extract);
}

// 중기부 사업공고 상세 페이지에서 hwpEditorBoardContent div의 본문 텍스트를 추출.
// mss.go.kr 게시판은 본문을 <div id="hwpEditorBoardContent" data-jsonlen="...">...</div>에 담는다.
// 실제로는 이 div가 비어있는(`&nbsp;`만 들어있는) 글이 많아 — 그땐 첨부파일명을 사업개요로 fallback.
function extractMssEditorBody(html: string): string | undefined {
  // div 시작 태그 매칭 (속성 순서/공백 모두 허용)
  const re = /<div[^>]*\bid=["']hwpEditorBoardContent["'][^>]*>([\s\S]*?)<\/div>/i;
  const m = html.match(re);
  if (!m) return undefined;
  const inner = stripHtml(m[1]).trim();
  // &nbsp;만 있거나 너무 짧은 경우는 의미 없는 본문으로 간주
  if (inner.length < 30) return undefined;
  return inner;
}

// 상세 페이지의 메타 테이블(공고번호/신청기간/담당부서/등록일)에서 보강 정보 추출.
// label → key 매핑을 따로 둔다 (정부 사이트의 메타 테이블은 board_view 안 별도 표).
const MSS_META_LABEL_TO_KEY: Record<string, string> = {
  공고번호: "공고번호",
  담당부서: "담당부서",
  등록일: "등록일",
};

function extractMssMetaTable(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<th\b[^>]*>([\s\S]*?)<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const label = stripHtml(m[1]).replace(/[\s·ㆍ\.:,()\[\]]/g, "");
    const value = stripHtml(m[2]).trim();
    if (!label || !value) continue;
    const key = MSS_META_LABEL_TO_KEY[label];
    if (key && !out[key]) out[key] = value;
  }
  return out;
}

// 중기부 사업공고: viewUrl이 게시판 글 상세 페이지.
// 1) hwpEditorBoardContent div에서 본문 텍스트 추출 → 사업개요
// 2) 메타 테이블에서 공고번호/담당부서/등록일 추출 → eligibilityRules에 보존
// 3) 본문이 비어있으면 fileName(이미 list 응답에 있음)을 사업개요 fallback으로 사용
//    — LLM 정형화 단계가 파일명에서 사업 성격을 추론할 수 있도록.
export async function enrichMssBiz(item: BenefitRaw): Promise<BenefitRaw> {
  if (item.sourceCode !== SOURCE_CODES.MSS_BIZ) return item;

  // 이미 충분한 summary가 있으면 detailUrl 없이도 fileName fallback만 처리
  const sumLen = (item.summary ?? "").trim().length;

  let body: string | undefined;
  let meta: Record<string, string> = {};

  // detailUrl이 있고 summary가 부족할 때만 상세 페이지 fetch (rate limit 절약)
  if (item.detailUrl && sumLen < 200) {
    const html = await safeFetch(item.detailUrl);
    if (html) {
      body = extractMssEditorBody(html);
      meta = extractMssMetaTable(html);
    }
  }

  // 보강할 키-값 모음
  const rules = { ...(item.eligibilityRules ?? {}) } as Record<string, unknown>;
  let touched = false;

  // 사업개요 우선순위: 본문 → 기존 summary → fileName fallback
  // mss list API의 dataContents(=summary)는 HTML이 섞여있으니 stripHtml로 정리.
  // 정리 후 비어있는(`hwpEditorBoardContent` div 빈 껍데기뿐인) 문자열은 fallback으로 떨어짐.
  const existingGaeyo = rules["사업개요"];
  // 기존 사업개요에 HTML 태그가 섞여있으면(이전 버전 enrich 결과) stripHtml로 정리
  if (typeof existingGaeyo === "string" && /<[a-z][^>]*>/i.test(existingGaeyo)) {
    const cleaned = stripHtml(existingGaeyo).trim();
    if (cleaned !== existingGaeyo) {
      rules["사업개요"] = cleaned;
      touched = true;
    }
  }
  const currentGaeyo = rules["사업개요"];
  const gaeyoEmpty =
    currentGaeyo == null ||
    currentGaeyo === "" ||
    (typeof currentGaeyo === "string" && currentGaeyo.trim().length < 10);
  if (gaeyoEmpty) {
    let gaeyo: string | undefined;
    if (body && body.length >= 30) {
      gaeyo = body; // extractMssEditorBody가 이미 stripHtml 처리
    } else {
      const cleanedSummary = stripHtml(item.summary ?? "").trim();
      if (cleanedSummary.length >= 30) {
        gaeyo = cleanedSummary;
      } else {
        // fileName을 사업개요 fallback으로 — 파일명만 있어도 LLM 정형화가 단서로 사용
        const fname = typeof rules.fileName === "string" ? rules.fileName : undefined;
        if (fname && fname.trim().length >= 5) {
          gaeyo = `첨부파일: ${fname.trim()}`;
        }
      }
    }
    if (gaeyo) {
      rules["사업개요"] = gaeyo;
      touched = true;
    }
  }

  // 메타 테이블 키들
  for (const [k, v] of Object.entries(meta)) {
    if (rules[k] == null || rules[k] === "") {
      rules[k] = v;
      touched = true;
    }
  }

  // 문의처: writerName + writerPhone 조합 (이미 list 응답에 있음)
  if (rules["문의처"] == null || rules["문의처"] === "") {
    const wn = typeof rules.writerName === "string" ? rules.writerName.trim() : "";
    const wp = typeof rules.writerPhone === "string" ? rules.writerPhone.trim() : "";
    const munui = [wn, wp].filter(Boolean).join(" ");
    if (munui) {
      rules["문의처"] = munui;
      touched = true;
    }
  }

  if (!touched) return item;
  return { ...item, eligibilityRules: rules };
}

// 중기부 지원사업(pblancBsnsService): pblancUrl(detailUrl)이 기업마당 상세페이지를 가리킴.
// 따라서 bizinfo와 동일한 dl/dt/dd 추출 로직을 그대로 사용.
export async function enrichMssSupport(item: BenefitRaw): Promise<BenefitRaw> {
  if (item.sourceCode !== SOURCE_CODES.MSS_SUPPORT) return item;
  if (!item.detailUrl) return item;
  const html = await safeFetch(item.detailUrl);
  if (!html) return item;
  const extract = extractFromHtml(html);
  return applyExtract(item, extract);
}

// 출처 코드를 보고 적절한 enricher를 호출하는 디스패처.
// 메인 시드 루프에서 단일 진입점으로 호출 가능.
export async function enrichBenefit(item: BenefitRaw): Promise<BenefitRaw> {
  switch (item.sourceCode) {
    case SOURCE_CODES.BIZINFO:
      return enrichBizinfo(item);
    case SOURCE_CODES.MSS_BIZ:
      return enrichMssBiz(item);
    case SOURCE_CODES.MSS_SUPPORT:
      return enrichMssSupport(item);
    default:
      return item;
  }
}

// rate limit 회피용 sleep — 호출자가 enrich 호출 사이에 사용.
// 예: for item of items { await enrichBenefit(item); await sleep(300); }
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
