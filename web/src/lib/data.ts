import "server-only";
import {
  demoAdminFeeds, demoAdminStats, demoAdminUsers, demoAuditLogs, demoCategories, demoFetchLogs,
  demoOshi, demoSources, demoTimeline,
} from "@/lib/demo";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminFeed, AdminStats, AdminUser, AuditLog, Category, FetchLog, Oshi, Platform, Source, TimelineItem,
} from "@/lib/types";

export const PAGE_SIZE = 48;

export async function getLibrary(): Promise<{ oshi: Oshi[]; categories: Category[]; sources: Source[] }> {
  if (DEMO) return { oshi: demoOshi, categories: demoCategories, sources: demoSources };

  const supabase = await createClient();
  const [oshi, categories, sources] = await Promise.all([
    supabase
      .from("oshi")
      .select("id, name, color, note, group_id, agency_id, genre_id, last_seen_at")
      .order("created_at"),
    supabase.from("categories").select("id, kind, name").order("name"),
    supabase
      .from("sources")
      .select("id, oshi_id, platform, mode, url, handle, label, feed_id")
      .order("created_at"),
  ]);
  const failed = oshi.error ?? categories.error ?? sources.error;
  if (failed) throw new Error(`データを読み込めませんでした: ${failed.message}`);

  return {
    oshi: (oshi.data ?? []) as Oshi[],
    categories: (categories.data ?? []) as Category[],
    sources: (sources.data ?? []) as Source[],
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
    .from("timeline")
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
  const { data } = await supabase.rpc("unread_counts");
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { oshi_id: string; unread: number }[]) counts[row.oshi_id] = row.unread;
  return counts;
}

// ---- 運営者向け ----

export async function getAdminStats(): Promise<AdminStats> {
  if (DEMO) return demoAdminStats;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_stats");
  if (error) throw new Error(`集計を読み込めませんでした: ${error.message}`);
  return data as AdminStats;
}

export async function getAdminUsers(search: string, page: number): Promise<AdminUser[]> {
  if (DEMO) {
    return demoAdminUsers.filter((u) => !search || u.email.includes(search) || u.display_name.includes(search));
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
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
  const { data, error } = await supabase.rpc("admin_list_feeds", {
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
    .from("fetch_logs")
    .select("id, feed_id, ok, items_found, items_added, duration_ms, error, created_at, feeds(title)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (onlyFailed) query = query.eq("ok", false);
  const { data, error } = await query;
  if (error) throw new Error(`取得ログを読み込めませんでした: ${error.message}`);
  return (data ?? []).map((row) => {
    const feed = row.feeds as { title?: string } | { title?: string }[] | null;
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
    .from("audit_logs")
    .select("id, action, target, detail, created_at, profiles(email)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`操作ログを読み込めませんでした: ${error.message}`);
  return (data ?? []).map((row) => {
    const profile = row.profiles as { email?: string } | { email?: string }[] | null;
    const email = Array.isArray(profile) ? profile[0]?.email : profile?.email;
    return {
      id: row.id as number,
      admin_email: email ?? "(削除済み)",
      action: row.action as string,
      target: row.target as string,
      detail: row.detail as string,
      created_at: row.created_at as string,
    };
  });
}
