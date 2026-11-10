import "server-only";
import {
  demoAdminFeeds, demoAdminStats, demoAdminUsers, demoAuditLogs, demoCategories, demoFetchLogs,
  demoOshi, demoSources, demoTimeline,
} from "@/lib/demo";
import { DEMO } from "@/lib/env";
import { recordsToLibrary, type OshiRecord } from "@/lib/records";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminFeed, AdminStats, AdminUser, AuditLog, Category, FetchLog, Oshi, Platform, Source, TimelineItem,
} from "@/lib/types";

export const PAGE_SIZE = 48;

export async function getLibrary(): Promise<{ oshi: Oshi[]; categories: Category[]; sources: Source[] }> {
  if (DEMO) return { oshi: demoOshi, categories: demoCategories, sources: demoSources };

  // 推しは今のアプリの記録(oshikatsu_records の kind = 'oshi')をそのまま使う
  const supabase = await createClient();
  const [records, seen, sources] = await Promise.all([
    supabase.from("oshikatsu_records").select("id, data").eq("kind", "oshi").eq("deleted", false),
    supabase.from("oshikatsu_feed_seen").select("oshi_id, last_seen_at"),
    supabase
      .from("oshikatsu_sources")
      .select("id, oshi_id, platform, mode, url, handle, label, feed_id")
      .order("created_at"),
  ]);
  const failed = records.error ?? seen.error ?? sources.error;
  if (failed) throw new Error(`データを読み込めませんでした: ${failed.message}`);

  const seenMap: Record<string, string> = {};
  for (const row of seen.data ?? []) seenMap[row.oshi_id as string] = row.last_seen_at as string;
  const { oshi, categories } = recordsToLibrary((records.data ?? []) as OshiRecord[], seenMap);
  const known = new Set(oshi.map((o) => o.id));

  return {
    oshi,
    categories,
    // 今のアプリで推しを削除した場合、その推しの登録は表示しない
    sources: ((sources.data ?? []) as Source[]).filter((s) => known.has(s.oshi_id)),
  };
}

export async function getTimeline(options: {
  oshiIds: string[];
  platform?: Platform;
  before?: string;
}): Promise<TimelineItem[]> {
  if (options.oshiIds.length === 0) return [];

  if (DEMO) {
    return demoTimeline
      .filter((item) => options.oshiIds.includes(item.oshi_id))
      .filter((item) => !options.platform || item.platform === options.platform)
      .filter((item) => !options.before || item.published_at < options.before)
      .slice(0, PAGE_SIZE);
  }

  const supabase = await createClient();
  let query = supabase
    .from("oshikatsu_timeline")
    .select("item_id, oshi_id, source_id, platform, title, url, thumbnail_url, published_at")
    .in("oshi_id", options.oshiIds)
    .order("published_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (options.platform) query = query.eq("platform", options.platform);
  if (options.before) query = query.lt("published_at", options.before);

  const { data, error } = await query;
  if (error) throw new Error(`新着を読み込めませんでした: ${error.message}`);
  return (data ?? []) as TimelineItem[];
}

// 推しごとの、いちばん新しい新着(YouTube・Blog)の日時。上部の推しのアイコンを新着が届いた順に並べるのに使う
export async function getLatestByOshi(): Promise<Record<string, string>> {
  if (DEMO) {
    const latest: Record<string, string> = {};
    for (const item of demoTimeline) if (!latest[item.oshi_id] || latest[item.oshi_id] < item.published_at) latest[item.oshi_id] = item.published_at;
    return latest;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("oshikatsu_timeline")
    .select("oshi_id, published_at")
    .order("published_at", { ascending: false })
    .limit(1000);
  const latest: Record<string, string> = {};
  for (const row of (data ?? []) as { oshi_id: string; published_at: string }[]) {
    if (!latest[row.oshi_id]) latest[row.oshi_id] = row.published_at;
  }
  return latest;
}

export async function getUnreadCounts(): Promise<Record<string, number>> {
  if (DEMO) {
    const counts: Record<string, number> = {};
    for (const item of demoTimeline) {
      const oshi = demoOshi.find((o) => o.id === item.oshi_id);
      if (oshi && item.published_at > oshi.last_seen_at) counts[oshi.id] = (counts[oshi.id] ?? 0) + 1;
    }
    return counts;
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("oshikatsu_unread_counts");
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { oshi_id: string; unread: number }[]) counts[row.oshi_id] = row.unread;
  return counts;
}

// ---- 運営者向け ----

export async function getAdminStats(): Promise<AdminStats> {
  if (DEMO) return demoAdminStats;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("oshikatsu_admin_stats");
  if (error) throw new Error(`集計を読み込めませんでした: ${error.message}`);
  return data as AdminStats;
}

export async function getAdminUsers(search: string, page: number): Promise<AdminUser[]> {
  if (DEMO) {
    return demoAdminUsers.filter((u) => !search || u.email.includes(search));
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("oshikatsu_admin_list_users", {
    search,
    page_size: 50,
    page_offset: page * 50,
  });
  if (error) throw new Error(`利用者を読み込めませんでした: ${error.message}`);
  return (data ?? []) as AdminUser[];
}

export async function getAdminFeeds(status: string, page: number): Promise<AdminFeed[]> {
  if (DEMO) return demoAdminFeeds.filter((f) => !status || f.status === status);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("oshikatsu_admin_list_feeds", {
    only_status: status,
    page_size: 100,
    page_offset: page * 100,
  });
  if (error) throw new Error(`取得元を読み込めませんでした: ${error.message}`);
  return (data ?? []) as AdminFeed[];
}

export async function getFetchLogs(onlyFailed: boolean): Promise<FetchLog[]> {
  if (DEMO) return demoFetchLogs.filter((log) => !onlyFailed || !log.ok);
  const supabase = await createClient();
  let query = supabase
    .from("oshikatsu_fetch_logs")
    .select("id, feed_id, ok, items_found, items_added, duration_ms, error, created_at, oshikatsu_feeds(title)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (onlyFailed) query = query.eq("ok", false);
  const { data, error } = await query;
  if (error) throw new Error(`取得ログを読み込めませんでした: ${error.message}`);
  return (data ?? []).map((row) => {
    const feed = row.oshikatsu_feeds as { title?: string } | { title?: string }[] | null;
    const title = Array.isArray(feed) ? feed[0]?.title : feed?.title;
    return {
      id: row.id as number,
      feed_id: row.feed_id as string | null,
      feed_title: title ?? "",
      ok: row.ok as boolean,
      items_found: row.items_found as number,
      items_added: row.items_added as number,
      duration_ms: row.duration_ms as number,
      error: row.error as string | null,
      created_at: row.created_at as string,
    };
  });
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  if (DEMO) return demoAuditLogs;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("oshikatsu_audit_logs")
    .select("id, admin_id, action, target, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`操作ログを読み込めませんでした: ${error.message}`);

  // 操作した運営者のメールアドレス(マスターは全員のプロフィールを読める)
  const ids = [...new Set((data ?? []).map((row) => row.admin_id as string | null).filter(Boolean))] as string[];
  const emails = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase.from("oshikatsu_profiles").select("user_id, email").in("user_id", ids);
    for (const p of profiles ?? []) emails.set(p.user_id as string, (p.email as string | null) ?? "");
  }

  return (data ?? []).map((row) => ({
    id: row.id as number,
    admin_email: emails.get(row.admin_id as string) || "(削除済み)",
    action: row.action as string,
    target: row.target as string,
    detail: row.detail as string,
    created_at: row.created_at as string,
  }));
}
