"use client";

import { useState } from "react";
import UnlockForm from "./UnlockForm";
import IdPhotoStudio from "./IdPhotoStudio";

type SpecPublic = {
  idx: number;
  name: string;
  display: string;
  size: string;
  width_px: number;
  height_px: number;
  desc: string;
};

export default function IdPhotoClient({
  unlocked: initialUnlocked,
  specs,
}: {
  unlocked: boolean;
  specs: SpecPublic[];
}) {
  const [unlocked, setUnlocked] = useState(initialUnlocked);

  if (!unlocked) {
    return <UnlockForm onUnlock={() => setUnlocked(true)} />;
  }
  return <IdPhotoStudio specs={specs} />;
}
