"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, ManualPost } from "@/lib/types";

// 個別投稿の更新: 推しのフィードに、過去の YouTube 動画などをURLで1件ずつ足す・外す。
// 足した投稿はその推しのフィードの先頭に並び、反応ボタンで保存することもできる

const MAX_PER_OSHI = 100;
const oshiId = z.string().trim().min(1).max(100);

// YouTube の動画のURLから、動画の番号とショートかどうかを読み取る
function parseYoutube(input: string): { id: string; short: boolean } | null {
  let raw = input.trim();
  if (!raw || raw.length > 500) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const valid = (id: string | undefined | null) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null);
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") {
    const id = valid(parts[0]);
    return id ? { id, short: false } : null;
  }
  if (host !== "youtube.com") return null;
  if (parts[0] === "watch") {
    const id = valid(url.searchParams.get("v"));
    return id ? { id, short: false } : null;
  }
  if (parts[0] === "shorts" || parts[0] === "live" || parts[0] === "embed") {
    const id = valid(parts[1]);
    return id ? { id, short: parts[0] === "shorts" } : null;
  }
  return null;
}

// 動画の題名とサムネイル(YouTube 公式の oEmbed)。読めなければ null
async function youtubeInfo(url: string): Promise<{ title: string; thumbnail: string | null } | "missing" | null> {
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (response.status === 404 || response.status === 400) return "missing";
    if (!response.ok) return null;
    const data = (await response.json()) as { title?: unknown; thumbnail_url?: unknown };
    const title = typeof data.title === "string" ? data.title.slice(0, 300) : "";
    const thumbnail = typeof data.thumbnail_url === "string" && /^https:\/\//.test(data.thumbnail_url) ? data.thumbnail_url : null;
    return { title, thumbnail };
  } catch {
    return null;
  }
}

export async function listManualPosts(oshi: string): Promise<ActionResult<{ posts: ManualPost[] }>> {
  await requireViewer();
  const parsed = oshiId.safeParse(oshi);
  if (!parsed.success) return { ok: false, error: "推しを選び直してください" };
  if (DEMO) return { ok: true, data: { posts: [] } };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oshikatsu_manual_posts")
    .select("id, oshi_id, platform, url, title, thumbnail_url, created_at")
    .eq("oshi_id", parsed.data)
    .order("created_at", { ascending: false })
    .limit(MAX_PER_OSHI);
  if (error) return { ok: false, error: "読み込めませんでした。時間をおいてお試しください" };
  return { ok: true, data: { posts: (data ?? []) as ManualPost[] } };
}

export async function addManualPost(oshi: string, input: string): Promise<ActionResult<{ post: ManualPost }>> {
  const viewer = await requireViewer();
  const parsedOshi = oshiId.safeParse(oshi);
  if (!parsedOshi.success) return { ok: false, error: "推しを選び直してください" };
  const video = parseYoutube(input);
  if (!video) return { ok: false, error: "YouTube の動画のURLを入力してください(例: https://www.youtube.com/watch?v=…)" };
  if (DEMO) return { ok: false, error: "デモ表示では追加できません" };

  const url = video.short ? `https://www.youtube.com/shorts/${video.id}` : `https://www.youtube.com/watch?v=${video.id}`;
  const supabase = await createClient();

  const { count } = await supabase
    .from("oshikatsu_manual_posts")
    .select("id", { count: "exact", head: true })
    .eq("oshi_id", parsedOshi.data);
  if ((count ?? 0) >= MAX_PER_OSHI) return { ok: false, error: `1人の推しに追加できるのは${MAX_PER_OSHI}件までです` };

  const info = await youtubeInfo(url);
  if (info === "missing") return { ok: false, error: "動画が見つかりませんでした(非公開・削除済みの可能性があります)" };

  const { data, error } = await supabase
    .from("oshikatsu_manual_posts")
    .insert({
      user_id: viewer.id,
      oshi_id: parsedOshi.data,
      platform: "youtube",
      url,
      title: info?.title || "YouTube の動画",
      thumbnail_url: info?.thumbnail ?? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
    })
    .select("id, oshi_id, platform, url, title, thumbnail_url, created_at")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "この動画はもう追加してあります" };
    return { ok: false, error: "追加できませんでした。時間をおいてお試しください" };
  }
  revalidatePath("/app");
  return { ok: true, data: { post: data as ManualPost } };
}

export async function removeManualPost(id: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "外せませんでした" };
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  const supabase = await createClient();
  const { error } = await supabase.from("oshikatsu_manual_posts").delete().eq("user_id", viewer.id).eq("id", parsed.data);
  if (error) return { ok: false, error: "外せませんでした" };
  revalidatePath("/app");
  return { ok: true };
}
