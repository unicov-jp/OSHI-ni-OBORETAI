"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { forgetDriveToken } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// Googleドライブとの接続を解除する: Google 側の許可を取り消し、保存したリフレッシュトークンを消す。
// ドライブに保存済みの写真は消さない(もう一度接続すれば、また表示できる)
export async function disconnectDrive(): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase.from("oshikatsu_gdrive_tokens").select("refresh_token").eq("user_id", viewer.id).maybeSingle();
  const token = data?.refresh_token as string | undefined;
  if (token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
  }
  const { error } = await supabase.from("oshikatsu_gdrive_tokens").delete().eq("user_id", viewer.id);
  if (error) return { ok: false, error: "解除できませんでした。時間をおいてもう一度お試しください。" };
  forgetDriveToken(viewer.id);
  revalidatePath("/app", "layout");
  return { ok: true };
}
