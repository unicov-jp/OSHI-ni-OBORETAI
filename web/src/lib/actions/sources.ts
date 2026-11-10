"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { discoverFeed } from "@/lib/fetchers/rss";
import { runFeed, type FeedRow } from "@/lib/fetchers/run";
import { SafeFetchError } from "@/lib/fetchers/safe-fetch";
import { resolveYoutubeHandle, youtubeFeedUrl } from "@/lib/fetchers/youtube";
import { parseAccountUrl, PLATFORM_EXAMPLE, PLATFORM_LABEL } from "@/lib/platforms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Platform, SourceMode } from "@/lib/types";

const DEMO_ERROR = "デモ表示では変更できません";

const addSchema = z.object({
  oshiId: z.string().uuid(),
  url: z.string().trim().min(1).max(500),
  label: z.string().trim().max(60).default(""),
  // どのサービスの区画から追加したか。入力されたURLがそのサービスのものかを確かめる
  expected: z.enum(["youtube", "blog", "x", "instagram", "threads", "tiktok", "link"]).optional(),
});

type Resolved = {
  platform: Platform;
  mode: SourceMode;
  url: string;
  handle: string;
  feed?: { platform: "youtube" | "blog"; externalKey: string; feedUrl: string; title: string };
};

// SNSアカウントを推しに登録する。
// URLの検証と取得元の解決をサーバー側で行い、確定した内容だけを特権クライアントで書き込む。
export async function addSource(input: z.input<typeof addSchema>): Promise<ActionResult<{ note?: string }>> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  const viewer = await requireViewer();

  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力内容を確認してください" };
  const { oshiId, label } = parsed.data;

  const account = parseAccountUrl(parsed.data.url);
  if ("error" in account) return { ok: false, error: account.error };

  const expected = parsed.data.expected;
  const generic = account.platform === "blog"; // SNS以外のURL
  if (expected && expected !== "link" && expected !== account.platform) {
    return { ok: false, error: `${PLATFORM_LABEL[expected]}のURLを入力してください(例: ${PLATFORM_EXAMPLE[expected]})` };
  }
  if (expected === "link" && !generic) {
    return { ok: false, error: `これは${PLATFORM_LABEL[account.platform]}のURLです。${PLATFORM_LABEL[account.platform]}の欄から追加してください。` };
  }

  // 自分の推しであることを、本人のセッション(行レベルセキュリティ)で確認する
  const supabase = await createClient();
  const { data: oshi } = await supabase.from("oshi").select("id").eq("id", oshiId).maybeSingle();
  if (!oshi) return { ok: false, error: "推しが見つかりません" };

  if (viewer.sourceCount >= viewer.maxSources) {
    return { ok: false, error: `登録できるアカウントは${viewer.maxSources}件までです。` };
  }

  const admin = createAdminClient();

  // 外部ページの取得を伴うため、1時間あたり30回までに制限する
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("rate_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", viewer.id)
    .eq("action", "source.add")
    .gte("created_at", since);
  if ((count ?? 0) >= 30) {
    return { ok: false, error: "登録の回数が上限に達しました。1時間ほどおいてからお試しください。" };
  }
  await admin.from("rate_events").insert({ user_id: viewer.id, action: "source.add" });

  let resolved: Resolved;
  let note: string | undefined;

  try {
    if (account.platform === "youtube") {
      let channelId = account.youtube?.channelId;
      let title = "";
      if (!channelId && account.youtube?.handle) {
        if (!process.env.YOUTUBE_API_KEY) {
          return {
            ok: false,
            error: "現在、@から始まるYouTubeのURLは登録できません。https://www.youtube.com/channel/UC... の形式で入力してください。",
          };
        }
        const channel = await resolveYoutubeHandle(account.youtube.handle, admin);
        if (!channel) return { ok: false, error: "YouTubeチャンネルが見つかりませんでした" };
        channelId = channel.channelId;
        title = channel.title;
      }
      resolved = {
        platform: "youtube",
        mode: "feed",
        url: account.url,
        handle: account.handle,
        feed: { platform: "youtube", externalKey: channelId!, feedUrl: youtubeFeedUrl(channelId!), title },
      };
    } else if (account.platform === "blog" && expected === "link") {
      resolved = { platform: "link", mode: "link", url: account.url, handle: account.handle };
    } else if (account.platform === "blog") {
      const found = await discoverFeed(account.url);
      if (found) {
        resolved = {
          platform: "blog",
          mode: "feed",
          url: account.url,
          handle: account.handle,
          feed: { platform: "blog", externalKey: found.feedUrl, feedUrl: found.feedUrl, title: found.feed.title },
        };
      } else {
        resolved = { platform: "link", mode: "link", url: account.url, handle: account.handle };
        note = "このページには新着を取得できるフィードが見つからなかったため、リンクとして保存しました。";
      }
    } else {
      resolved = { platform: account.platform, mode: account.mode, url: account.url, handle: account.handle };
    }
  } catch (error) {
    if (error instanceof SafeFetchError) return { ok: false, error: `ページを確認できませんでした: ${error.message}` };
    return { ok: false, error: "アカウントを確認できませんでした。URLを確かめてもう一度お試しください。" };
  }

  let feedId: string | null = null;
  let newFeed: FeedRow | null = null;
  if (resolved.feed) {
    const { data: existing } = await admin
      .from("feeds")
      .select("id")
      .eq("platform", resolved.feed.platform)
      .eq("external_key", resolved.feed.externalKey)
      .maybeSingle();
    if (existing) {
      feedId = existing.id as string;
    } else {
      const { data: created, error } = await admin
        .from("feeds")
        .upsert(
          {
            platform: resolved.feed.platform,
            external_key: resolved.feed.externalKey,
            feed_url: resolved.feed.feedUrl,
            title: resolved.feed.title,
          },
          { onConflict: "platform,external_key" },
        )
        .select("id, platform, external_key, feed_url, title, error_count")
        .single();
      if (error || !created) return { ok: false, error: "登録できませんでした。時間をおいてもう一度お試しください。" };
      feedId = created.id as string;
      newFeed = created as FeedRow;
    }
  }

  const { error: insertError } = await admin.from("sources").insert({
    user_id: viewer.id,
    oshi_id: oshiId,
    platform: resolved.platform,
    mode: resolved.mode,
    url: resolved.url,
    handle: resolved.handle,
    label,
    feed_id: feedId,
  });
  if (insertError) {
    if (insertError.code === "23505") return { ok: false, error: "このアカウントは登録済みです" };
    if (insertError.message.includes("SOURCE_LIMIT")) {
      return { ok: false, error: `登録できるアカウントは${viewer.maxSources}件までです。` };
    }
    return { ok: false, error: "登録できませんでした。時間をおいてもう一度お試しください。" };
  }

  // 初めて登録された取得元は、その場で1回取得して新着をすぐ表示できるようにする
  if (newFeed) {
    const result = await runFeed(admin, newFeed);
    if (!result.ok) note = "登録しました。新着の取得に失敗したため、次回の定期取得で再試行します。";
  }

  revalidatePath("/app", "layout");
  return { ok: true, data: { note } };
}

export async function deleteSource(id: string): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  await requireViewer();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "対象が正しくありません" };

  const supabase = await createClient();
  const { error } = await supabase.from("sources").delete().eq("id", id);
  if (error) return { ok: false, error: "削除できませんでした。時間をおいてもう一度お試しください。" };
  revalidatePath("/app", "layout");
  return { ok: true };
}
