// 홈 콜드스타트 — 가격 데이터가 거의 없을 때 보이는 가치 증명 카드
// 빈 화면 대신: 1) 무엇을 해결하는 서비스인지 2) 신뢰 통계 3) 첫 행동 CTA
import Link from "next/link";
import { IconCamera, IconBarcode, IconPin } from "@/components/icons";

type Props = {
  /** 누적 통계 — 신뢰 신호로 노출 */
  stats: { products: number; stores: number; prices: number };
};

export default function HomeColdStart({ stats }: Props) {
  return (
    <section className="bg-gradient-to-br from-brand-soft via-surface to-brand-soft/30 border border-line rounded-2xl p-5 md:p-6">
      <div className="text-center mb-5">
        <h2 className="text-lg md:text-xl font-extrabold text-ink-1">
          영수증 한 장으로 우리 동네 마트 가격이 한눈에
        </h2>
        <p className="text-sm text-ink-2 mt-1.5">
          이마트·롯데마트·킴스클럽·온라인 쇼핑몰 가격을 한 화면에서 비교하세요
        </p>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <li className="bg-surface rounded-xl p-3 flex items-start gap-2.5">
          <span className="shrink-0 w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-brand-600">
            <IconCamera size={18} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-ink-1">자동 가계부</div>
            <p className="text-xs text-ink-3 mt-0.5">
              영수증 사진 한 장이면 가계부가 시작돼요
            </p>
          </div>
        </li>
        <li className="bg-surface rounded-xl p-3 flex items-start gap-2.5">
          <span className="shrink-0 w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-brand-600">
            <IconBarcode size={18} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-ink-1">바코드 스캔</div>
            <p className="text-xs text-ink-3 mt-0.5">
              마트에서 찍기 전, 다른 매장 가격을 즉시 비교
            </p>
          </div>
        </li>
        <li className="bg-surface rounded-xl p-3 flex items-start gap-2.5">
          <span className="shrink-0 w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-brand-600">
            <IconPin size={18} />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-ink-1">우리 동네 매장</div>
            <p className="text-xs text-ink-3 mt-0.5">
              주변 마트 위치·영업시간·휴무 한눈에
            </p>
          </div>
        </li>
      </ul>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
        <Link
          href="/upload"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-soft hover:shadow-raise transition"
        >
          <IconCamera size={16} />
          첫 영수증 올리기
        </Link>
        <Link
          href="/stores"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-surface hover:bg-surface-muted border border-line text-ink-1 px-5 py-2.5 rounded-xl font-semibold text-sm transition"
        >
          <IconPin size={16} />
          주변 마트 둘러보기
        </Link>
      </div>

      {(stats.products > 0 || stats.stores > 0) && (
        <p className="text-xs text-ink-3 text-center mt-4">
          이미 등록된 상품 {stats.products.toLocaleString()}개 · 매장{" "}
          {stats.stores.toLocaleString()}곳 · 가격{" "}
          {stats.prices.toLocaleString()}건
        </p>
      )}
    </section>
  );
}
