"use server";

import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, SavePostInput } from "@/lib/types";

// 投稿の保存(Developer だけ)。保存済みなら外し、まだなら保存する。保存したかどうかを返す。
// 保存した投稿は新着の整理(古い新着の削除)とは別の表に持つので、期間無制限で残る

const schema = z.object({
  url: z.string().trim().url().max(500).regex(/^https?:\/\//),
  oshiId: z.string().trim().min(1).max(100),
  platform: z.string().trim().min(1).max(40),
  title: z.string().max(300).default(""),
  thumbnailUrl: z.string().trim().max(1000).regex(/^https:\/\//).nullish(),
  publishedAt: z.string().datetime({ offset: true }).nullish(),
});

export async function toggleSavedPost(input: SavePostInput): Promise<ActionResult<{ saved: boolean }>> {
  const viewer = await requireViewer();
  if (viewer.plan !== "master") return { ok: false, error: "保存は Developer で使えます" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "保存できない投稿です" };
  if (DEMO) return { ok: false, error: "デモ表示では保存できません" };
  const post = parsed.data;
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("oshikatsu_saved_posts")
    .select("url")
    .eq("user_id", viewer.id)
    .eq("url", post.url)
    .maybeSingle();
  if (readError) return { ok: false, error: "保存できませんでした。時間をおいてお試しください" };

  if (existing) {
    const { error } = await supabase.from("oshikatsu_saved_posts").delete().eq("user_id", viewer.id).eq("url", post.url);
    if (error) return { ok: false, error: "保存を外せませんでした" };
    return { ok: true, data: { saved: false } };
  }

  const { error } = await supabase.from("oshikatsu_saved_posts").insert({
    user_id: viewer.id,
    url: post.url,
    oshi_id: post.oshiId,
    platform: post.platform,
    title: post.title.slice(0, 300),
    thumbnail_url: post.thumbnailUrl ?? null,
    published_at: post.publishedAt ?? null,
  });
  if (error) return { ok: false, error: "保存できませんでした。時間をおいてお試しください" };
  return { ok: true, data: { saved: true } };
}

// 保存一覧から外す
export async function removeSavedPost(url: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  if (viewer.plan !== "master") return { ok: false, error: "保存は Developer で使えます" };
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  const parsed = z.string().trim().max(500).safeParse(url);
  if (!parsed.success) return { ok: false, error: "外せませんでした" };
  const supabase = await createClient();
  const { error } = await supabase.from("oshikatsu_saved_posts").delete().eq("user_id", viewer.id).eq("url", parsed.data);
  if (error) return { ok: false, error: "外せませんでした" };
  return { ok: true };
}
