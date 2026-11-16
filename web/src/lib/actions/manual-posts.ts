"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { safeFetchText } from "@/lib/fetchers/safe-fetch";
import { canUseAdvanced } from "@/lib/plans";
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

// RedTube の動画のURLから、動画の番号を読み取る(redtube.com・ru.redtube.com などの /<番号>)
function parseRedtube(input: string): string | null {
  let raw = input.trim();
  if (!raw || raw.length > 500) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "redtube.com" && !host.endsWith(".redtube.com")) return null;
  const id = /^\/(\d{3,12})\/?$/.exec(url.pathname)?.[1] ?? (host.startsWith("embed.") ? url.searchParams.get("id") : null);
  return id && /^\d{3,12}$/.test(id) ? id : null;
}

// RedTube の公開の窓口から、動画の題名とサムネイルを読む。読めなければ null
async function redtubeInfo(id: string): Promise<{ title: string; thumbnail: string | null } | null> {
  try {
    const page = await safeFetchText(
      `https://api.redtube.com/?data=redtube.Videos.getVideoById&video_id=${id}&output=json&thumbsize=big`,
      { headers: { accept: "application/json" } },
    );
    const data = JSON.parse(page.text) as { video?: { title?: unknown; thumb?: unknown; default_thumb?: unknown } };
    const video = data.video;
    if (!video) return null;
    const pick = (value: unknown) => (typeof value === "string" && /^https:\/\//.test(value) ? value : null);
    return {
      title: typeof video.title === "string" ? video.title.slice(0, 300) : "",
      thumbnail: pick(video.default_thumb) ?? pick(video.thumb),
    };
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
  const redtube = video ? null : parseRedtube(input);
  if (redtube && !canUseAdvanced(viewer.plan)) return { ok: false, error: "RedTube の動画は Sensitive プランで追加できます" };
  if (!video && !redtube) {
    return {
      ok: false,
      error: canUseAdvanced(viewer.plan)
        ? "YouTube か RedTube の動画のURLを入力してください"
        : "YouTube の動画のURLを入力してください(例: https://www.youtube.com/watch?v=…)",
    };
  }
  if (DEMO) return { ok: false, error: "デモ表示では追加できません" };
  if (redtube) return addRedtubePost(viewer.id, parsedOshi.data, redtube);
  if (!video) return { ok: false, error: "追加できませんでした" };

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

async function countFor(oshi: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("oshikatsu_manual_posts").select("id", { count: "exact", head: true }).eq("oshi_id", oshi);
  return count ?? 0;
}

async function addRedtubePost(userId: string, oshi: string, id: string): Promise<ActionResult<{ post: ManualPost }>> {
  if ((await countFor(oshi)) >= MAX_PER_OSHI) return { ok: false, error: `1人の推しに追加できるのは${MAX_PER_OSHI}件までです` };
  const info = await redtubeInfo(id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oshikatsu_manual_posts")
    .insert({
      user_id: userId,
      oshi_id: oshi,
      platform: "redtube",
      url: `https://www.redtube.com/${id}`,
      title: info?.title || "RedTube の動画",
      thumbnail_url: info?.thumbnail ?? null,
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
