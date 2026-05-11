"use client";

import { useState, type ReactNode } from "react";

type Props = {
  /** 처음 보여줄 개수. default 5. */
  initialCount?: number;
  /** 자식들 — 각 li나 카드 등. children.length로 total 계산. */
  children: ReactNode;
  /** 펼치기 버튼 라벨 prefix. default "더 보기" */
  expandLabel?: string;
  /** 접기 버튼 라벨. default "접기" */
  collapseLabel?: string;
  /** 컨테이너 className — children 묶음을 감싸는 wrapper에는 적용하지 않고
   *  버튼+children 전체에 적용됨. 보통 미지정. */
  className?: string;
  /** children을 감쌀 wrapper 엘리먼트. default "div".
   *  부모가 ul일 때 아이템이 li이면 "ul"로 지정해야 의미적으로 맞음.
   *  대부분의 경우 div로 두면 됨 — 호출 측에서 ul/grid를 직접 두르는 패턴 권장. */
  as?: "div" | "ul";
  /** wrapper에 적용할 className (space-y-2 같은 spacing). */
  innerClassName?: string;
};

/**
 * 긴 리스트를 default 일부만 보여주고 "더 보기" 토글로 펼치는 wrapper.
 * - children.length가 initialCount 이하면 그냥 다 렌더 (버튼 없음).
 * - 그렇지 않으면 처음 initialCount개만 노출 + 토글 버튼.
 *
 * 사용 예:
 *   <CollapsibleList initialCount={5} innerClassName="space-y-2">
 *     {prices.map(p => <li key={p.id}>...</li>)}
 *   </CollapsibleList>
 */
export default function CollapsibleList({
  initialCount = 5,
  children,
  expandLabel = "더 보기",
  collapseLabel = "접기",
  className,
  as = "div",
  innerClassName,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // children을 array로 normalize
  const items: ReactNode[] = Array.isArray(children)
    ? (children as ReactNode[])
    : [children];

  const total = items.length;
  const needsToggle = total > initialCount;
  const visible = expanded || !needsToggle ? items : items.slice(0, initialCount);
  const remaining = total - initialCount;

  const Wrapper = as;

  return (
    <div className={className}>
      <Wrapper className={innerClassName}>{visible}</Wrapper>

      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`mt-2 w-full text-sm py-2 px-3 rounded-lg border transition-colors font-medium ${
            expanded
              ? "border-line bg-surface-muted text-ink-3 hover:bg-surface-muted"
              : "border-line-strong bg-brand-soft text-brand-700 hover:bg-brand-soft"
          }`}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>▲ {collapseLabel}</>
          ) : (
            <>▼ {remaining}개 {expandLabel}</>
          )}
        </button>
      )}
    </div>
  );
}
