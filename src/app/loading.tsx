// 홈 페이지 로딩 중 표시되는 스켈레톤 — 페이지 이동 즉시 보이게
export default function HomeLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-12 bg-stone-100 rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 bg-stone-100 rounded-lg" />
        ))}
      </div>
      <div className="h-24 bg-stone-100 rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 bg-stone-100 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
