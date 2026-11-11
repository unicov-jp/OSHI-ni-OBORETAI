import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFeed, type ParsedFeed, type ParsedItem } from "@/lib/fetchers/rss";
import { safeFetchText } from "@/lib/fetchers/safe-fetch";

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

// ハンドル(@name)からチャンネルIDとチャンネル名を引く。
// APIキーがあれば公式API(1ユニット)、なければチャンネルの公開ページの先頭から読み取る。
export async function resolveYoutubeHandle(
  handle: string,
  admin: SupabaseClient,
): Promise<{ channelId: string; title: string } | null> {
  if (!apiKey()) return resolveYoutubeHandleViaPage(handle);
  const data = (await callApi("channels", { part: "id,snippet", forHandle: `@${handle}` })) as {
    items?: { id: string; snippet?: { title?: string } }[];
  };
  await admin.rpc("oshikatsu_bump_api_usage", { p_provider: "youtube", p_units: 1 });
  const channel = data.items?.[0];
  if (!channel || !/^UC[A-Za-z0-9_-]{22}$/.test(channel.id)) return null;
  return { channelId: channel.id, title: channel.snippet?.title ?? "" };
}

// チャンネルの新着動画を取得する。
// APIキーがあれば公式API(1回1ユニット)、なければチャンネルの公開フィードを使う。
export async function fetchYoutubeChannel(channelId: string, admin: SupabaseClient): Promise<ParsedFeed> {
  if (!apiKey()) return fetchYoutubeViaFeed(channelId);
  // 公式APIの1日の上限(既定1万ユニット)の9割を使ったら、その日は公開フィードに切り替える
  if (await nearQuota(admin)) return fetchYoutubeViaFeed(channelId);

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
  await admin.rpc("oshikatsu_bump_api_usage", { p_provider: "youtube", p_units: 1 });

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

// APIキーがないときの読み方。YouTube の公開フィードは 404 を返すことがあるので、
// チャンネルのフィード → アップロード再生リストのフィード → チャンネルの動画一覧のページ の順に試す
async function fetchYoutubeViaFeed(channelId: string): Promise<ParsedFeed> {
  try {
    return await fetchYoutubeFeedUrl(channelId, youtubeFeedUrl(channelId));
  } catch (first) {
    try {
      return await fetchYoutubeFeedUrl(channelId, `https://www.youtube.com/feeds/videos.xml?playlist_id=UU${channelId.slice(2)}`);
    } catch {
      try {
        const page = await fetchYoutubeViaPage(channelId);
        if (page.items.length > 0) return page;
      } catch {
        // 下で最初の失敗を伝える
      }
      throw first;
    }
  }
}

// チャンネルの「動画」の一覧ページから、最新の動画の番号・題名・おおよその投稿日(「3 days ago」など)を読む
const UNIT_MS: Record<string, number> = {
  second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000,
};
export function relativeToIso(text: string, now = Date.now()): string | null {
  const match = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.exec(text);
  if (!match) return null;
  return new Date(now - Number(match[1]) * UNIT_MS[match[2].toLowerCase()]).toISOString();
}

export function videosFromChannelPage(html: string, now = Date.now()): ParsedItem[] {
  const items: ParsedItem[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"([\s\S]{0,6000}?)"publishedTimeText":\{"simpleText":"([^"]{1,60})"\}/g)) {
    const [, videoId, body, when] = match;
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    const raw = /"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.){1,400})"/.exec(body)?.[1] ?? "";
    let title = raw;
    try {
      title = JSON.parse(`"${raw}"`) as string;
    } catch {
      // そのまま使う
    }
    items.push({
      externalId: videoId,
      title: (title || "(無題)").slice(0, 300),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: relativeToIso(when, now) ?? new Date(now).toISOString(),
      thumbnailUrl: thumbnail(videoId),
    });
    if (items.length >= 20) break;
  }
  return items;
}

async function fetchYoutubeViaPage(channelId: string): Promise<ParsedFeed> {
  const page = await safeFetchText(`https://www.youtube.com/channel/${channelId}/videos`, {
    truncateAt: 1900 * 1024,
    headers: { "accept-language": "en-US,en;q=0.8", accept: "text/html" },
  });
  const title = channelFromPage(page.text)?.title ?? "";
  return { title, siteUrl: `https://www.youtube.com/channel/${channelId}`, items: videosFromChannelPage(page.text), approximate: true };
}

async function fetchYoutubeFeedUrl(channelId: string, url: string): Promise<ParsedFeed> {
  const feed = await fetchFeed(url);
  const items = feed.items.flatMap((item) => {
    const videoId = /^yt:video:([A-Za-z0-9_-]{11})$/.exec(item.externalId)?.[1];
    if (!videoId) return [];
    return [
      {
        ...item,
        externalId: videoId,
        // ショートはフィードのリンクが /shorts/ になっている。縦長で表示するため、その形を残す
        url: /\/shorts\//.test(item.url)
          ? `https://www.youtube.com/shorts/${videoId}`
          : `https://www.youtube.com/watch?v=${videoId}`,
        thumbnailUrl: thumbnail(videoId),
      },
    ];
  });
  return { ...feed, siteUrl: `https://www.youtube.com/channel/${channelId}`, items };
}

// チャンネルページの canonical / og:url にある /channel/UC... からチャンネルIDを読む。
export function channelFromPage(html: string): { channelId: string; title: string } | null {
  const id =
    /<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ??
    /<meta[^>]+property="og:url"[^>]+content="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ??
    /<meta[^>]+itemprop="(?:identifier|channelId)"[^>]+content="(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ??
    /"externalId":"(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ??
    /"channelId":"(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ??
    /"browseId":"(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1];
  if (!id) return null;
  const rawTitle = /<meta[^>]+property="og:title"[^>]+content="([^"]{0,200})"/.exec(html)?.[1] ?? "";
  const title = rawTitle
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return { channelId: id, title };
}

async function resolveYoutubeHandleViaPage(handle: string): Promise<{ channelId: string; title: string } | null> {
  // チャンネルIDはページの後ろの方にしか無いことがあるため、上限(2MB)の手前まで読む
  const page = await safeFetchText(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
    truncateAt: 1900 * 1024,
    headers: { "accept-language": "ja,en;q=0.8", accept: "text/html" },
  });
  return channelFromPage(page.text);
}

// 今日(太平洋時間の日付。YouTube の上限はこの日付で数える)の公式APIの使用量が上限の9割を超えたか。1分ごとに読み直す
const QUOTA = Number(process.env.YOUTUBE_DAILY_QUOTA ?? 10000);
let quotaCheck: { at: number; near: boolean } | null = null;
async function nearQuota(admin: SupabaseClient): Promise<boolean> {
  if (quotaCheck && Date.now() - quotaCheck.at < 60_000) return quotaCheck.near;
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const { data } = await admin.from("oshikatsu_api_usage").select("units").eq("day", day).eq("provider", "youtube").maybeSingle();
  const used = Number((data as { units?: number } | null)?.units ?? 0);
  quotaCheck = { at: Date.now(), near: used >= QUOTA * 0.9 };
  return quotaCheck.near;
}
