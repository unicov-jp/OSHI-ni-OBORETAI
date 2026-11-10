"use server";

import { cookies } from "next/headers";
import { requireViewer } from "@/lib/auth";
import { FEED_MODE_COOKIE, type FeedMode } from "@/lib/feed-mode";
import { canUseAdvanced } from "@/lib/plans";
import type { ActionResult } from "@/lib/types";

// 通常 ⇔ Sensitive を切り替える(Sensitive プランだけ)。切り替えた先を返す
export async function toggleFeedMode(): Promise<ActionResult<{ mode: FeedMode }>> {
  const viewer = await requireViewer();
  if (!canUseAdvanced(viewer.plan)) return { ok: false, error: "Sensitive プランで使えます" };
  const store = await cookies();
  const next: FeedMode = store.get(FEED_MODE_COOKIE)?.value === "sensitive" ? "normal" : "sensitive";
  store.set(FEED_MODE_COOKIE, next, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return { ok: true, data: { mode: next } };
}

// 推しの登録ページのボタン用: 指定した方に切り替える
export async function setFeedMode(mode: FeedMode): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (mode === "sensitive" && !canUseAdvanced(viewer.plan)) return { ok: false, error: "Sensitive プランで使えます" };
  const store = await cookies();
  store.set(FEED_MODE_COOKIE, mode, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
}
