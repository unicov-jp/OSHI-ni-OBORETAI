import "server-only";
import { safeFetchText } from "@/lib/fetchers/safe-fetch";

// X(旧Twitter)の公開の埋め込み用の窓口(タイムライン埋め込みが裏で使うページ)から、
// 最新の投稿の番号と日時を読む。投稿の中身は保存せず、表示は X 公式の「投稿1件の埋め込み」で行う。
// X の都合で予告なく使えなくなることがある。同じアカウントは1時間に1回まで見に行く。

export type XPost = { id: string; at: string };

const cache = new Map<string, { posts: XPost[]; at: number }>();
const TTL = 60 * 60 * 1000;
const MAX_POSTS = 10;

const HEADERS = {
  accept: "text/html",
  "accept-language": "ja,en;q=0.8",
  "user-agent": "Mozilla/5.0 (compatible; OshiOboretaiBot/1.0)",
};

const url = (handle: string) => `https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`;

type Entry = { content?: { tweet?: { id_str?: string; created_at?: string; retweeted_status?: unknown } } };

export function postsFromSyndication(html: string): XPost[] {
  const posts: XPost[] = [];
  const add = (id: string, at: string) => {
    if (!/^\d{5,25}$/.test(id) || posts.some((p) => p.id === id)) return;
    const time = new Date(at);
    posts.push({ id, at: Number.isNaN(time.getTime()) ? new Date().toISOString() : time.toISOString() });
  };
  const data = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (data) {
    try {
      const json = JSON.parse(data) as { props?: { pageProps?: { timeline?: { entries?: Entry[] } } } };
      for (const entry of json.props?.pageProps?.timeline?.entries ?? []) {
        const tweet = entry.content?.tweet;
        if (tweet?.id_str && tweet.created_at) add(tweet.id_str, tweet.created_at);
      }
    } catch {
      // 形が変わっていたら下の読み方に任せる
    }
  }
  if (posts.length === 0) {
    for (const match of html.matchAll(/"created_at":"([^"]{10,40})"[^{}]{0,2000}?"id_str":"(\d{5,25})"/g)) add(match[2], match[1]);
  }
  return posts.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, MAX_POSTS);
}

export async function xPosts(handle: string): Promise<XPost[]> {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return [];
  const key = handle.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.posts;
  try {
    const page = await safeFetchText(url(handle), { headers: HEADERS });
    const posts = postsFromSyndication(page.text);
    cache.set(key, { posts, at: Date.now() });
    return posts;
  } catch {
    cache.set(key, { posts: [], at: Date.now() - TTL + 10 * 60 * 1000 });
    return [];
  }
}

// 確認用(マスター向け): 転送先・大きさ・見つかった件数と、手がかりになる部分の前後だけを返す
export async function xProbe(handle: string): Promise<Record<string, unknown>> {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return { error: "IDの形が正しくありません" };
  try {
    const page = await safeFetchText(url(handle), { headers: HEADERS });
    const marks = ["__NEXT_DATA__", "id_str", "created_at", "entries", "login"];
    const hints: Record<string, string | null> = {};
    for (const mark of marks) {
      const at = page.text.indexOf(mark);
      hints[mark] = at < 0 ? null : page.text.slice(Math.max(0, at - 40), at + 80).replace(/[^\x20-\x7E]/g, "?");
    }
    return { finalUrl: page.finalUrl, bytes: page.text.length, posts: postsFromSyndication(page.text).length, hints };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "取得できませんでした" };
  }
}
