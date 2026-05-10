"use client";

// 외부 링크 클릭 추적 — PostHog event + (선택) 제휴 redirect 경로 적용
// 어떤 외부 출구가 가장 잘 클릭되는지 측정해 수익 모델 결정의 기초 자료로 사용.
//
// 사용 예:
//   <TrackedLink href={benefit.applyUrl} kind="benefit_apply" id={benefit.id}>
//     신청하러 가기
//   </TrackedLink>
//
// kind 분류:
//   benefit_apply   — 정부혜택 신청 외부 링크
//   benefit_detail  — 정부혜택 상세 페이지 외부 링크
//   product_buy     — 네이버 쇼핑 등 상품 구매 외부 링크
//   store_map       — 매장 외부 지도/홈페이지
//   other           — 기타 외부 출구
//
// 제휴(Affiliate)가 도입되면 process.env.NEXT_PUBLIC_AFFILIATE_PROXY 환경변수를
// 설정해서 모든 외부 링크를 추적 프록시(/api/r?to=...)로 보내도록 전환할 수 있음.

import { logEvent } from "@/lib/observability";
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

type TrackedLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & {
  href: string;
  kind:
    | "benefit_apply"
    | "benefit_detail"
    | "product_buy"
    | "store_map"
    | "other";
  /** 추적용 식별자 (benefitId, productId, storeId 등). 익명 통계용. */
  id?: string;
  /** 자식 콘텐츠 */
  children: ReactNode;
};

export default function TrackedLink({
  href,
  kind,
  id,
  children,
  target,
  rel,
  ...rest
}: TrackedLinkProps) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // 새 탭/새 창 열기 모디파이어는 그대로 두고 이벤트만 보냄 (preventDefault X)
    logEvent("external_link_click", {
      kind,
      target_id: id,
      href,
      // host는 통계용 — 어느 도메인이 잘 클릭되는지
      host: safeHost(href),
    });
  }

  const finalRel = rel ?? "noopener noreferrer";
  const finalTarget = target ?? "_blank";

  return (
    <a href={href} onClick={handleClick} target={finalTarget} rel={finalRel} {...rest}>
      {children}
    </a>
  );
}

function safeHost(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return "invalid";
  }
}
