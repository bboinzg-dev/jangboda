"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  "신선식품",
  "유제품",
  "가공·즉석식품",
  "음료",
  "주류",
  "양념·조미료",
  "곡물·면·빵",
  "과자·간식",
  "생활용품",
  "기타",
] as const;

type Props = {
  productId: string;
  current: string;
  isOverride?: boolean; // 사용자가 이미 override한 항목인지 (시각적 표시)
};

// 가계부 항목별 카테고리 직접 변경 (사용자별 override)
// 자동 분류가 잘못 잡았을 때 사용자가 즉시 정정
export default function CategorySelect({
  productId,
  current,
  isOverride,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);

  async function change(newCat: string) {
    if (newCat === value) return;
    setSaving(true);
    setValue(newCat);
    try {
      await fetch("/api/budget/category-override", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, category: newCat }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      value={value}
      onChange={(e) => change(e.target.value)}
      disabled={saving}
      className={`text-[10px] px-1.5 py-0.5 rounded border ${
        isOverride
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-stone-200 bg-stone-50 text-stone-600"
      } cursor-pointer hover:border-brand-400`}
      title={isOverride ? "사용자가 직접 분류한 카테고리" : "자동 분류"}
    >
      {CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
