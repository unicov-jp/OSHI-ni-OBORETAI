"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { setFeedMode } from "@/lib/actions/mode";
import type { FeedMode } from "@/lib/feed-mode";

// 通常 / Sensitive の切り替えボタン(2つ並び)。押した方の一覧に切り替える
export function ModeSwitch({ mode, sensitiveName = "Sensitive" }: { mode: FeedMode; sensitiveName?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pick = (next: FeedMode) =>
    startTransition(async () => {
      if (next === mode) return;
      const result = await setFeedMode(next);
      if (result.ok) router.refresh();
    });
  const item = (value: FeedMode, label: string) => (
    <button
      key={value}
      type="button"
      role="tab"
      aria-selected={mode === value}
      disabled={pending}
      onClick={() => pick(value)}
      className={`h-9 rounded-lg px-4 text-sm font-semibold ${mode === value ? (value === "sensitive" ? "bg-[#ff2d6f] text-white" : "bg-surface text-text shadow-sm") : "text-muted"}`}
    >
      {label}
    </button>
  );
  return (
    <div role="tablist" aria-label="推しの一覧の切り替え" className="inline-grid grid-cols-2 rounded-xl bg-sunken p-1">
      {item("normal", "通常")}
      {item("sensitive", sensitiveName)}
    </div>
  );
}

// 通常の一覧へ戻すだけのボタン
export function BackToNormal() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass("secondary")}
      onClick={() =>
        startTransition(async () => {
          const result = await setFeedMode("normal");
          if (result.ok) router.refresh();
        })
      }
    >
      通常の推しに戻す
    </button>
  );
}
