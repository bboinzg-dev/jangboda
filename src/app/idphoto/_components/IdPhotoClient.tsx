"use client";

import { useState } from "react";
import UnlockForm from "./UnlockForm";
import IdPhotoStudio, {
  type SpecPublic,
  type BackgroundOption,
} from "./IdPhotoStudio";

export default function IdPhotoClient({
  unlocked: initialUnlocked,
  specs,
  backgroundOptions,
}: {
  unlocked: boolean;
  specs: SpecPublic[];
  backgroundOptions: BackgroundOption[];
}) {
  const [unlocked, setUnlocked] = useState(initialUnlocked);

  if (!unlocked) {
    return <UnlockForm onUnlock={() => setUnlocked(true)} />;
  }
  return <IdPhotoStudio specs={specs} backgroundOptions={backgroundOptions} />;
}
