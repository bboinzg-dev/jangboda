// Lucide 스타일 단선 SVG 아이콘 세트 — Editorial Grocer 핸드오프 v1.
// 모두 currentColor 기반이라 text-* 클래스로 색 제어. 기본 1.7 stroke.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

function makeIcon(
  paths: React.ReactNode,
  defaults?: { fill?: string },
) {
  return function Icon({
    size = 18,
    strokeWidth = 1.7,
    fill = defaults?.fill ?? "none",
    ...rest
  }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={fill}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const SearchIcon = makeIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
);

export const CameraIcon = makeIcon(
  <>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13" r="3.5" />
  </>,
);

export const PinIcon = makeIcon(
  <>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" />
    <circle cx="12" cy="10" r="2.5" />
  </>,
);

export const UserIcon = makeIcon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </>,
);

export const HomeIcon = makeIcon(
  <>
    <path d="M3 11 12 3l9 8" />
    <path d="M5 10v10h14V10" />
  </>,
);

export const CheckIcon = makeIcon(<path d="m5 12 5 5L20 7" />);

export const WarnIcon = makeIcon(
  <>
    <path d="M12 3 2 21h20L12 3Z" />
    <path d="M12 10v5" />
    <path d="M12 18v.5" />
  </>,
);

export const SparkleIcon = makeIcon(
  <>
    <path d="M12 3v6" />
    <path d="M12 15v6" />
    <path d="M3 12h6" />
    <path d="M15 12h6" />
  </>,
);

export const CloseIcon = makeIcon(
  <>
    <path d="M6 6 18 18" />
    <path d="M18 6 6 18" />
  </>,
);

export const ChevronIcon = makeIcon(<path d="m9 6 6 6-6 6" />);

export const ChevronDownIcon = makeIcon(<path d="m6 9 6 6 6-6" />);

export const TrendingIcon = makeIcon(
  <>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </>,
);

export const TrendingDownIcon = makeIcon(
  <>
    <path d="m3 7 6 6 4-4 8 8" />
    <path d="M14 17h7v-7" />
  </>,
);

export const ReceiptIcon = makeIcon(
  <>
    <path d="M5 3v18l2-1.5L9 21l2-1.5L13 21l2-1.5L17 21l2-1.5V3l-2 1.5L15 3l-2 1.5L11 3 9 4.5 7 3 5 4.5Z" />
    <path d="M8 8h8" />
    <path d="M8 12h8" />
    <path d="M8 16h5" />
  </>,
);

export const CartIcon = makeIcon(
  <>
    <circle cx="9" cy="20" r="1.5" />
    <circle cx="17" cy="20" r="1.5" />
    <path d="M3 4h2l2.5 11.5a2 2 0 0 0 2 1.5h7.5a2 2 0 0 0 2-1.5L21 8H6" />
  </>,
);

export const WalletIcon = makeIcon(
  <>
    <path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v3" />
    <circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </>,
);

export const PlusIcon = makeIcon(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>,
);

export const MinusIcon = makeIcon(<path d="M5 12h14" />);

export const FilterIcon = makeIcon(
  <>
    <path d="M3 5h18" />
    <path d="M6 12h12" />
    <path d="M10 19h4" />
  </>,
);

export const InfoIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v.5" />
    <path d="M12 11v6" />
  </>,
);

export const FlameIcon = makeIcon(
  <path d="M12 3s4 4 4 8a4 4 0 0 1-8 0c0-1.5 1-3 1-3s-3 1-3 5a6 6 0 0 0 12 0c0-5-6-10-6-10Z" />,
);

export const StoreIcon = makeIcon(
  <>
    <path d="M4 9h16l-1-5H5L4 9Z" />
    <path d="M5 9v11h14V9" />
    <path d="M9 20v-5h6v5" />
  </>,
);

export const BellIcon = makeIcon(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8Z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </>,
);

export const MoonIcon = makeIcon(
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />,
);

export const SunIcon = makeIcon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </>,
);
