import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFeed, type ParsedFeed } from "@/lib/fetchers/rss";
import { fetchYoutubeChannel } from "@/lib/fetchers/youtube";

export type FeedRow = {
  id: string;
  platform: "youtube" | "blog";
  external_key: string;
  feed_url: string;
  title: string;
  error_count: number;
};

const HOUR = 60 * 60 * 1000;
const MAX_ERRORS = 8;

function intervalMs(): number {
  const minutes = Number(process.env.FETCH_INTERVAL_MINUTES ?? 60);
  return Math.max(15, Number.isFinite(minutes) ? minutes : 60) * 60 * 1000;
}

// 取得元1件を取りに行き、新着を保存して次回の取得時刻を決める。
// 失敗が続くほど間隔を空け、8回連続で失敗したら停止して運営者の確認を待つ。
export async function runFeed(
  admin: SupabaseClient,
  feed: FeedRow,
): Promise<{ ok: boolean; added: number; error?: string }> {
  const started = Date.now();
  try {
    const parsed: ParsedFeed =
      feed.platform === "youtube"
        ? await fetchYoutubeChannel(feed.external_key, admin)
        : await fetchFeed(feed.feed_url);

    let added = 0;
    if (parsed.items.length > 0) {
      const ids = parsed.items.map((item) => item.externalId);
      const { data: existing } = await admin
        .from("oshikatsu_feed_items")
        .select("external_id")
        .eq("feed_id", feed.id)
        .in("external_id", ids);
      const known = new Set((existing ?? []).map((row) => row.external_id as string));
      added = ids.filter((id) => !known.has(id)).length;

      const now = new Date().toISOString();
      const { error } = await admin.from("oshikatsu_feed_items").upsert(
        parsed.items.map((item) => ({
          feed_id: feed.id,
          external_id: item.externalId,
          title: item.title,
          url: item.url,
          thumbnail_url: item.thumbnailUrl,
          published_at: item.publishedAt,
          fetched_at: now,
        })),
        { onConflict: "feed_id,external_id" },
      );
      if (error) throw new Error(`保存に失敗しました: ${error.message}`);
    }

    await admin
      .from("oshikatsu_feeds")
      .update({
        title: parsed.title || feed.title,
        site_url: parsed.siteUrl,
        status: "active",
        error_count: 0,
        last_error: null,
        last_fetched_at: new Date().toISOString(),
        next_fetch_at: new Date(Date.now() + intervalMs()).toISOString(),
      })
      .eq("id", feed.id);
    await admin.from("oshikatsu_fetch_logs").insert({
      feed_id: feed.id,
      ok: true,
      items_found: parsed.items.length,
      items_added: added,
      duration_ms: Date.now() - started,
    });
    return { ok: true, added };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "不明なエラー").slice(0, 500);
    const errorCount = feed.error_count + 1;
    const backoff = Math.min(24 * HOUR, intervalMs() * 2 ** Math.min(errorCount, 6));
    await admin
      .from("oshikatsu_feeds")
      .update({
        status: errorCount >= MAX_ERRORS ? "error" : "active",
        error_count: errorCount,
        last_error: message,
        next_fetch_at: new Date(Date.now() + backoff).toISOString(),
      })
      .eq("id", feed.id);
    await admin.from("oshikatsu_fetch_logs").insert({
      feed_id: feed.id,
      ok: false,
      duration_ms: Date.now() - started,
      error: message,
    });
    return { ok: false, added: 0, error: message };
  }
}

// 期限が来た取得元をまとめて処理する。同時に走らせるのは5件まで。
export async function runDueFeeds(admin: SupabaseClient, batch = 30) {
  const { data, error } = await admin.rpc("oshikatsu_claim_due_feeds", { batch });
  if (error) throw new Error(`取得対象の確保に失敗しました: ${error.message}`);
  const feeds = (data ?? []) as FeedRow[];

  let ok = 0;
  let failed = 0;
  let added = 0;
  const queue = [...feeds];
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    for (let feed = queue.shift(); feed; feed = queue.shift()) {
      const result = await runFeed(admin, feed);
      if (result.ok) ok++;
      else failed++;
      added += result.added;
    }
  });
  await Promise.all(workers);

  return { claimed: feeds.length, ok, failed, added };
}

// 手動の「更新」: その利用者が登録した取得元のうち、前回の取得から10分以上たったものを取りに行く。
// 同時に押されても二重に取得しないよう、DB側で確保してから取得する。時間は最大 timeLimitMs まで。
export async function runUserFeeds(admin: SupabaseClient, userId: string, timeLimitMs = 40_000) {
  const started = Date.now();
  const totals = { claimed: 0, ok: 0, failed: 0, added: 0 };

  while (Date.now() - started < timeLimitMs) {
    const { data, error } = await admin.rpc("oshikatsu_claim_user_feeds", {
      uid: userId,
      min_age_minutes: 10,
      batch: 10,
    });
    if (error) throw new Error(`取得対象の確保に失敗しました: ${error.message}`);
    const feeds = (data ?? []) as FeedRow[];
    totals.claimed += feeds.length;

    const queue = [...feeds];
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
      for (let feed = queue.shift(); feed; feed = queue.shift()) {
        const result = await runFeed(admin, feed);
        if (result.ok) totals.ok++;
        else totals.failed++;
        totals.added += result.added;
      }
    });
    await Promise.all(workers);
    if (feeds.length < 10) break;
  }
  return totals;
}

// 推しを1人選んだとき: その推しに登録した取得元のうち、前回の取得から10分以上たったものだけを取りに行く。
// 確保した時点で last_fetched_at を進め、続けて押されても二重に取得しない。
export async function runOshiFeeds(admin: SupabaseClient, userId: string, oshiId: string) {
  const totals = { claimed: 0, ok: 0, failed: 0, added: 0 };
  const { data: rows } = await admin
    .from("oshikatsu_sources")
    .select("feed_id")
    .eq("user_id", userId)
    .eq("oshi_id", oshiId)
    .not("feed_id", "is", null);
  const ids = [...new Set((rows ?? []).map((r) => r.feed_id as string))].slice(0, 30);
  if (ids.length === 0) return totals;

  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("oshikatsu_feeds")
    .update({ last_fetched_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "active")
    .or(`last_fetched_at.is.null,last_fetched_at.lt.${cutoff}`)
    .select("id, platform, external_key, feed_url, title, error_count");
  if (error) throw new Error(`取得対象の確保に失敗しました: ${error.message}`);
  const feeds = (data ?? []) as FeedRow[];
  totals.claimed = feeds.length;

  const queue = [...feeds];
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    for (let feed = queue.shift(); feed; feed = queue.shift()) {
      const result = await runFeed(admin, feed);
      if (result.ok) totals.ok++;
      else totals.failed++;
      totals.added += result.added;
    }
  });
  await Promise.all(workers);
  return totals;
}
