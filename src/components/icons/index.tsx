// 핸드오프 디자인 시스템 — 1.5px stroke 라인 아이콘
// 사용: <IconCart size={20} className="text-ink-1" />
// 모든 아이콘 props: { size = 20, className }
// 이모지(🛒 📸 📷 📍 🏠 🔍 ★ 🔔 ✓ ▲ ▼) 대체용

type IconProps = { size?: number; className?: string };

const baseProps = (size: number, className?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  "aria-hidden": true,
});

export function IconCart({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13l-1.5 6h13M7 13L5.4 5" />
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
    </svg>
  );
}

export function IconCamera({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M3 7h3l2-3h8l2 3h3a1 1 0 011 1v11a1 1 0 01-1 1H3a1 1 0 01-1-1V8a1 1 0 011-1z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function IconBarcode({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M3 5v14M6 5v14M9 5v14M12 5v14M15 5v14M18 5v14M21 5v14" />
    </svg>
  );
}

export function IconPin({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M12 21s-7-7.5-7-12a7 7 0 0114 0c0 4.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

export function IconHome({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1v-9z" />
    </svg>
  );
}

export function IconSearch({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function IconUser({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

export function IconStar({ size = 20, className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg {...baseProps(size, className)} fill={filled ? "currentColor" : "none"}>
      <path d="M12 3l2.6 6 6.4.6-4.8 4.4 1.4 6.5L12 17l-5.6 3.5L7.8 14 3 9.6 9.4 9 12 3z" />
    </svg>
  );
}

export function IconBell({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M6 8a6 6 0 0112 0v5l1.5 3h-15L6 13V8z" />
      <path d="M10 19a2 2 0 004 0" />
    </svg>
  );
}

export function IconCheck({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

export function IconArrowUp({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function IconArrowDown({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  );
}

export function IconArrowRight({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export function IconStore({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M3 9l1.5-5h15L21 9M4 9v11h16V9M4 9h16M9 13h6" />
    </svg>
  );
}

export function IconReceipt({ size = 20, className }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M5 3v18l2-2 2 2 2-2 2 2 2-2 2 2 2-2V3l-2 2-2-2-2 2-2-2-2 2-2-2-2 2z" />
      <path d="M8 8h8M8 12h8M8 16h6" />
    </svg>
  );
}
