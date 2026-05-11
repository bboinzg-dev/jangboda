// 레시피 목록 로딩 스켈레톤
export default function RecipesLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-surface-muted rounded-lg max-w-md" />
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-7 w-16 bg-surface-muted rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-44 bg-surface-muted rounded-lg" />
        ))}
      </div>
    </div>
  );
}
