"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { discoverFeed } from "@/lib/fetchers/rss";
import { runFeed, type FeedRow } from "@/lib/fetchers/run";
import { SafeFetchError } from "@/lib/fetchers/safe-fetch";
import { resolveYoutubeHandle, youtubeFeedUrl } from "@/lib/fetchers/youtube";
import { ADVANCED_PLATFORMS, parseAccountUrl, PLATFORM_EXAMPLE, PLATFORM_LABEL } from "@/lib/platforms";
import { canUseAdvanced } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLibrary } from "@/lib/data";
import type { ActionResult, Platform, SourceMode, Viewer } from "@/lib/types";

const DEMO_ERROR = "デモ表示では変更できません";
// DBへの書き込みに失敗したとき、原因を調べられるよう失敗の種類(コードと短い説明)を添える。
// 鍵の値などの秘密は含まれない。
function dbError(error: { code?: string; message?: string } | null): string {
  const base = "登録できませんでした。時間をおいてもう一度お試しください。";
  if (!error) return base;
  const message = (error.message ?? "").slice(0, 120);
  if (error.code === "42501" || /permission denied|row-level security/i.test(message)) {
    return `登録できませんでした(書き込みの権限がありません: ${error.code ?? ""})。サーバーの秘密鍵(SUPABASE_SECRET_KEY)の設定を確認してください。`;
  }
  if (error.code === "42P01" || /does not exist/i.test(message)) {
    return `登録できませんでした(表が見つかりません: ${error.code ?? ""})。新着用のSQLを実行してください。`;
  }
  return `${base}(${error.code ?? "?"}: ${message})`;
}

const RATE_LIMIT_ERROR = "登録の回数が上限に達しました。1時間ほどおいてからお試しください。";

const addSchema = z.object({
  oshiId: z.string().trim().min(1).max(100),
  url: z.string().trim().min(1).max(500),
  label: z.string().trim().max(60).default(""),
  // どのサービスの区画から追加したか。入力されたURLがそのサービスのものかを確かめる
  expected: z.enum(["youtube", "blog", "x", "instagram", "threads", "tiktok", "link", "fantia", "myfans", "xfans", "fanza"]).optional(),
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
  const result = await addSourceFor(viewer, input);
  if (result.ok) revalidatePath("/app", "layout");
  return result;
}

async function addSourceFor(
  viewer: Viewer,
  input: z.input<typeof addSchema>,
): Promise<ActionResult<{ note?: string }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "入力内容を確認してください" };
  const { oshiId, label } = parsed.data;

  const account = parseAccountUrl(parsed.data.url);
  if ("error" in account) return { ok: false, error: account.error };

  // Fantia・myfans・xfans・FANZA は Sensitive プランだけ
  if (ADVANCED_PLATFORMS.includes(account.platform) && !canUseAdvanced(viewer.plan)) {
    return { ok: false, error: `${PLATFORM_LABEL[account.platform]}は Sensitive プランで登録できます。` };
  }

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
  const { data: oshi } = await supabase
    .from("oshikatsu_records")
    .select("id")
    .eq("kind", "oshi")
    .eq("id", oshiId)
    .eq("deleted", false)
    .maybeSingle();
  if (!oshi) return { ok: false, error: "推しが見つかりません" };

  if (viewer.maxSources !== null && viewer.sourceCount >= viewer.maxSources) {
    return { ok: false, error: `登録できるアカウントは${viewer.maxSources}件までです。` };
  }

  const admin = createAdminClient();

  // 外部ページの取得を伴う登録(YouTube・Blog)は、1時間あたり30回までに制限する。
  // X・Instagram・TikTok・Threads・リンクは外部に取りに行かないので数えない。
  const fetches = account.platform === "youtube" || (account.platform === "blog" && expected !== "link");
  if (fetches) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("oshikatsu_rate_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", viewer.id)
      .eq("action", "source.add")
      .gte("created_at", since);
    if ((count ?? 0) >= 30) {
      return { ok: false, error: RATE_LIMIT_ERROR };
    }
    await admin.from("oshikatsu_rate_events").insert({ user_id: viewer.id, action: "source.add" });
  }

  let resolved: Resolved;
  let note: string | undefined;

  try {
    if (account.platform === "youtube") {
      let channelId = account.youtube?.channelId;
      let title = "";
      if (!channelId && account.youtube?.handle) {
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
      .from("oshikatsu_feeds")
      .select("id")
      .eq("platform", resolved.feed.platform)
      .eq("external_key", resolved.feed.externalKey)
      .maybeSingle();
    if (existing) {
      feedId = existing.id as string;
    } else {
      const { data: created, error } = await admin
        .from("oshikatsu_feeds")
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
      if (error || !created) return { ok: false, error: dbError(error) };
      feedId = created.id as string;
      newFeed = created as FeedRow;
    }
  }

  const { error: insertError } = await admin.from("oshikatsu_sources").insert({
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
    if (insertError.message.includes("INVALID_OSHI")) return { ok: false, error: "推しが見つかりません" };
    if (insertError.message.includes("SOURCE_LIMIT")) {
      return { ok: false, error: `登録できるアカウントは${viewer.maxSources}件までです。` };
    }
    return { ok: false, error: dbError(insertError) };
  }

  // 初めて登録された取得元は、その場で1回取得して新着をすぐ表示できるようにする
  if (newFeed) {
    const result = await runFeed(admin, newFeed);
    if (!result.ok) note = "登録しました。新着の取得に失敗したため、次回の定期取得で再試行します。";
  }

  return { ok: true, data: { note } };
}

// 今のアプリ(推し活手帳)で推しに登録してあるSNSを、まだ登録していない分だけまとめて取り込む。
// 1回の実行は40秒まで。残りがあれば、もう一度押すと続きから取り込む。
export async function importAllSns(): Promise<
  ActionResult<{ added: number; linked: number; failed: { name: string; url: string; error: string }[]; remaining: number }>
> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  const viewer = await requireViewer();
  const library = await getLibrary();

  const normalize = (url: string) => url.toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/+$/, "");
  const queue: { oshiId: string; name: string; platform: Platform; url: string }[] = [];
  for (const oshi of library.oshi) {
    const registered = new Set(library.sources.filter((s) => s.oshi_id === oshi.id).map((s) => normalize(s.url)));
    for (const sns of oshi.sns) {
      if (registered.has(normalize(sns.url))) continue;
      // Fantia・myfans・xfans・FANZA は Sensitive プランのときだけ取り込む(それ以外のプランでは入力が残っていても登録しない)
      if (ADVANCED_PLATFORMS.includes(sns.platform) && !canUseAdvanced(viewer.plan)) continue;
      registered.add(normalize(sns.url));
      queue.push({ oshiId: oshi.id, name: oshi.name, platform: sns.platform, url: sns.url });
    }
  }

  const started = Date.now();
  let added = 0;
  let linked = 0;
  const failed: { name: string; url: string; error: string }[] = [];
  let index = 0;
  for (; index < queue.length; index++) {
    if (Date.now() - started > 40_000) break;
    const item = queue[index];
    const result = await addSourceFor(viewer, { oshiId: item.oshiId, url: item.url, expected: item.platform });
    if (result.ok) {
      if (result.data?.note?.includes("リンクとして")) linked++;
      else added++;
    } else if (result.error !== "このアカウントは登録済みです") {
      failed.push({ name: item.name, url: item.url, error: result.error });
      // 上限に達したら、残りを試しても同じなので止める
      if (result.error === RATE_LIMIT_ERROR || result.error.includes("件までです")) {
        index++;
        break;
      }
    }
  }

  revalidatePath("/app", "layout");
  return { ok: true, data: { added, linked, failed, remaining: queue.length - index } };
}

export async function deleteSource(id: string): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  await requireViewer();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "対象が正しくありません" };

  const supabase = await createClient();
  const { error } = await supabase.from("oshikatsu_sources").delete().eq("id", id);
  if (error) return { ok: false, error: "削除できませんでした。時間をおいてもう一度お試しください。" };
  revalidatePath("/app", "layout");
  return { ok: true };
}
