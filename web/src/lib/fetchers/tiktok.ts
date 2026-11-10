import "server-only";
import { safeFetchText } from "@/lib/fetchers/safe-fetch";

// TikTok のアカウントの公開の埋め込みページ(/embed/@ID。公式のクリエイター埋め込みが表示するページ)から、
// 最新の動画の番号と日時を読む。動画は保存せず、表示は TikTok 公式の動画プレーヤー(/player/v1/<番号>)で行う。
// TikTok の都合で予告なく使えなくなることがある。同じアカウントは1時間に1回まで見に行く。

export type TikTokVideo = { id: string; at: string | null };

const cache = new Map<string, { videos: TikTokVideo[]; at: number }>();
const TTL = 60 * 60 * 1000;
const MAX_VIDEOS = 10;

const HEADERS = {
  accept: "text/html",
  "accept-language": "ja,en;q=0.8",
  "user-agent": "Mozilla/5.0 (compatible; OshiOboretaiBot/1.0)",
};

const url = (handle: string) => `https://www.tiktok.com/embed/@${handle}`;

export function videosFromEmbed(html: string): TikTokVideo[] {
  const videos: TikTokVideo[] = [];
  const add = (id: string, createTime?: string) => {
    if (videos.some((v) => v.id === id)) return;
    const seconds = createTime ? Number(createTime) : NaN;
    videos.push({ id, at: Number.isFinite(seconds) && seconds > 1e9 ? new Date(seconds * 1000).toISOString() : null });
  };
  // 動画の一覧(videoList など)の部分だけを見る。アカウント自体の番号を拾わないため
  const start = html.search(/videoList|itemList|"videos"/);
  const part = start >= 0 ? html.slice(start, start + 400_000) : "";
  for (const match of part.matchAll(/"id"\s*:\s*"(\d{17,21})"[^{}]{0,3000}?"createTime"\s*:\s*"?(\d{9,11})/g)) add(match[1], match[2]);
  if (videos.length === 0) for (const match of part.matchAll(/"id"\s*:\s*"(\d{17,21})"/g)) add(match[1]);
  for (const match of html.matchAll(/\/video\/(\d{17,21})/g)) add(match[1]);
  return videos.slice(0, MAX_VIDEOS);
}

export async function tiktokVideos(handle: string): Promise<TikTokVideo[]> {
  if (!/^[A-Za-z0-9._]{2,24}$/.test(handle)) return [];
  const key = handle.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.videos;
  try {
    const page = await safeFetchText(url(handle), { headers: HEADERS });
    const videos = videosFromEmbed(page.text);
    cache.set(key, { videos, at: Date.now() });
    return videos;
  } catch {
    cache.set(key, { videos: [], at: Date.now() - TTL + 10 * 60 * 1000 });
    return [];
  }
}

// 確認用(マスター向け): 転送先・大きさ・見つかった件数と、手がかりになる部分の前後だけを返す
export async function tiktokProbe(handle: string): Promise<Record<string, unknown>> {
  if (!/^[A-Za-z0-9._]{2,24}$/.test(handle)) return { error: "IDの形が正しくありません" };
  try {
    const page = await safeFetchText(url(handle), { headers: HEADERS });
    const marks = ["videoList", "itemList", "createTime", "/video/", "overload", "__FRONTITY", "__NEXT_DATA__", "SIGI_STATE"];
    const hints: Record<string, string | null> = {};
    for (const mark of marks) {
      const at = page.text.indexOf(mark);
      hints[mark] = at < 0 ? null : page.text.slice(Math.max(0, at - 40), at + 100).replace(/[^\x20-\x7E]/g, "?");
    }
    return { finalUrl: page.finalUrl, bytes: page.text.length, videos: videosFromEmbed(page.text).length, hints };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "取得できませんでした" };
  }
}
