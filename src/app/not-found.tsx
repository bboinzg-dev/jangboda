import Link from "next/link";

export default function NotFound() {
  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">🛒</div>
      <h1 className="text-2xl font-bold mb-2">페이지를 찾을 수 없습니다</h1>
      <p className="text-ink-4 mb-6">이동한 주소가 잘못되었거나 사라진 페이지입니다.</p>
      <Link
        href="/"
        className="inline-block bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg"
      >
        홈으로 가기
      </Link>
    </div>
  );
}
