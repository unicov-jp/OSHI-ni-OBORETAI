import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFeed, type ParsedFeed, type ParsedItem } from "@/lib/fetchers/rss";

const API = "https://www.googleapis.com/youtube/v3";

function apiKey(): string | null {
  return process.env.YOUTUBE_API_KEY || null;
}

export function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

function thumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

async function callApi(path: string, params: Record<string, string>): Promise<unknown> {
  const key = apiKey();
  if (!key) throw new Error("YOUTUBE_API_KEY が設定されていません");
  const query = new URLSearchParams({ ...params, key });
  const response = await fetch(`${API}/${path}?${query}`, {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`YouTube APIの呼び出しに失敗しました(HTTP ${response.status})`);
  }
  return response.json();
}

// ハンドル(@name)からチャンネルIDとチャンネル名を引く。APIを1ユニット消費する。
export async function resolveYoutubeHandle(
  handle: string,
  admin: SupabaseClient,
): Promise<{ channelId: string; title: string } | null> {
  const data = (await callApi("channels", { part: "id,snippet", forHandle: `@${handle}` })) as {
    items?: { id: string; snippet?: { title?: string } }[];
  };
  await admin.rpc("bump_api_usage", { p_provider: "youtube", p_units: 1 });
  const channel = data.items?.[0];
  if (!channel || !/^UC[A-Za-z0-9_-]{22}$/.test(channel.id)) return null;
  return { channelId: channel.id, title: channel.snippet?.title ?? "" };
}

// チャンネルの新着動画を取得する。
// APIキーがあれば公式API(1回1ユニット)、なければチャンネルの公開フィードを使う。
export async function fetchYoutubeChannel(channelId: string, admin: SupabaseClient): Promise<ParsedFeed> {
  if (!apiKey()) return fetchYoutubeViaFeed(channelId);

  const uploads = `UU${channelId.slice(2)}`;
  const data = (await callApi("playlistItems", {
    part: "snippet,contentDetails",
    playlistId: uploads,
    maxResults: "20",
  })) as {
    items?: {
      snippet?: { title?: string; channelTitle?: string; publishedAt?: string };
      contentDetails?: { videoId?: string; videoPublishedAt?: string };
    }[];
  };
  await admin.rpc("bump_api_usage", { p_provider: "youtube", p_units: 1 });

  const items: ParsedItem[] = [];
  let title = "";
  for (const entry of data.items ?? []) {
    const videoId = entry.contentDetails?.videoId;
    if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) continue;
    title ||= entry.snippet?.channelTitle ?? "";
    const published = entry.contentDetails?.videoPublishedAt ?? entry.snippet?.publishedAt;
    items.push({
      externalId: videoId,
      title: (entry.snippet?.title ?? "(無題)").slice(0, 300),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: published ? new Date(published).toISOString() : new Date().toISOString(),
      thumbnailUrl: thumbnail(videoId),
    });
  }
  return { title, siteUrl: `https://www.youtube.com/channel/${channelId}`, items };
}

async function fetchYoutubeViaFeed(channelId: string): Promise<ParsedFeed> {
  const feed = await fetchFeed(youtubeFeedUrl(channelId));
  const items = feed.items.flatMap((item) => {
    const videoId = /^yt:video:([A-Za-z0-9_-]{11})$/.exec(item.externalId)?.[1];
    if (!videoId) return [];
    return [
      {
        ...item,
        externalId: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnailUrl: thumbnail(videoId),
      },
    ];
  });
  return { ...feed, siteUrl: `https://www.youtube.com/channel/${channelId}`, items };
}
