"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export async function updateDisplayName(name: string): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  await requireViewer();
  const parsed = z.string().trim().max(40, "表示名は40文字までです").safeParse(name);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("oshikatsu_set_display_name", { new_name: parsed.data });
  if (error) return { ok: false, error: "保存できませんでした。時間をおいてもう一度お試しください。" };
  revalidatePath("/app", "layout");
  return { ok: true };
}
