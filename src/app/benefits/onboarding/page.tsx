import Link from "next/link";
import { CATEGORIES } from "@/lib/benefits/types";

export const dynamic = "force-dynamic";

// 카테고리별 입력 폼은 후속 단계에서 구현.
// 현재는 카테고리 카드만 보여주는 골격.
// priority별로 그룹핑: 1(필수) → 2(권장) → 3(자세히) → 4(선택)
const PRIORITY_LABELS: Record<number, { title: string; desc: string }> = {
  1: { title: "필수 정보", desc: "기본 매칭에 꼭 필요해요" },
  2: { title: "권장 정보", desc: "입력하면 매칭이 정확해져요" },
  3: { title: "추가 정보", desc: "받을 수 있는 혜택이 더 늘어나요" },
  4: { title: "선택 정보", desc: "특수 자격이 있으면 입력하세요" },
};

export default function BenefitsOnboardingPage() {
  // TODO(포인트 게이팅): 활성화 시 canAccessBenefits() 호출
  // TODO(인증): 로그인 필수로 만들 경우 Supabase getUser() 추가

  const grouped = new Map<number, typeof CATEGORIES[number][]>();
  for (const cat of CATEGORIES) {
    if (!grouped.has(cat.priority)) grouped.set(cat.priority, []);
    grouped.get(cat.priority)!.push(cat);
  }

  return (
    <div className="space-y-8">
      <section>
        <Link
          href="/benefits"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← 정부 혜택 홈으로
        </Link>
        <h1 className="text-2xl font-bold mt-2 mb-1">정보 입력</h1>
        <p className="text-stone-600 text-sm">
          입력한 정보로 받을 수 있는 혜택을 매칭합니다. 처음에는 필수 정보만 입력해도
          되고, 더 정확한 매칭을 원하면 모든 카테고리를 채워주세요.
        </p>
      </section>

      <section className="space-y-6">
        {[1, 2, 3, 4].map((priority) => {
          const cats = grouped.get(priority) ?? [];
          if (cats.length === 0) return null;
          const meta = PRIORITY_LABELS[priority];
          return (
            <div key={priority}>
              <div className="mb-3">
                <h2 className="text-lg font-bold text-stone-900">{meta.title}</h2>
                <p className="text-xs text-stone-500">{meta.desc}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cats.map((cat) => (
                  <Link
                    key={cat.key}
                    href={`/benefits/onboarding/${cat.key}`}
                    className="bg-white border border-stone-200 rounded-lg p-4 hover:border-indigo-400 hover:bg-indigo-50/30"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold">{cat.label}</div>
                        <div className="text-xs text-stone-500">
                          항목 {cat.coreFields}개
                        </div>
                      </div>
                      <div className="text-stone-400">›</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-xs text-stone-500">
        <strong className="text-stone-700">개인정보 처리 안내:</strong> 입력하신 정보는
        혜택 매칭 외 다른 목적으로 사용되지 않으며, 사용자만 조회할 수 있습니다.
        제3자 제공 없음.
      </section>
    </div>
  );
}
