import "server-only";
import { cookies } from "next/headers";
import { canUseAdvanced } from "@/lib/plans";
import type { Oshi, Viewer } from "@/lib/types";

// 推しの一覧の切り替え: 通常の推しと、Sensitive として登録した推し。
// 設定・管理ボタンの長押しで切り替え、端末の Cookie に覚える。Sensitive プラン(と Developer)だけが Sensitive にできる
export type FeedMode = "normal" | "sensitive";
export const FEED_MODE_COOKIE = "oshi_mode";

export async function getFeedMode(viewer: Viewer): Promise<FeedMode> {
  if (!canUseAdvanced(viewer.plan)) return "normal";
  const store = await cookies();
  return store.get(FEED_MODE_COOKIE)?.value === "sensitive" ? "sensitive" : "normal";
}

export function oshiInMode(oshi: Oshi[], mode: FeedMode): Oshi[] {
  return oshi.filter((o) => (mode === "sensitive" ? o.sensitive : !o.sensitive));
}
