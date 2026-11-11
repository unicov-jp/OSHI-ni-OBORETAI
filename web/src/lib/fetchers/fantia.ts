import "server-only";
import { safeFetchText } from "@/lib/fetchers/safe-fetch";

// Fantia のファンクラブの最新の投稿(番号・タイトル・投稿日)を、サイトが画面を作るのに使っている読み取り用の窓口から読む。
// 本文や画像は会員限定なので読まない。同じファンクラブは1時間に1回まで見に行く。
// Fantia の都合で予告なく使えなくなることがある。

export type FantiaPost = { id: string; title: string; at: string | null };

const cache = new Map<string, { posts: FantiaPost[]; at: number }>();
const TTL = 60 * 60 * 1000;
const MAX_POSTS = 20;
const HEADERS = {
  accept: "application/json",
  "accept-language": "ja,en;q=0.8",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

// ファンクラブの番号(handle は "fanclubs/12345" の形で保存してある)
export function fantiaClubId(handleOrUrl: string): string | null {
  const id = /(?:fanclubs\/)?(\d{1,12})\b/.exec(handleOrUrl)?.[1];
  return id ?? null;
}

function toIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

// 返ってきた JSON の中から、投稿らしいもの({ id: 数, title: 文字 } で、名前に post を含む配列の中)を集める
export function postsFromFantia(data: unknown): FantiaPost[] {
  const found = new Map<string, FantiaPost>();
  const visit = (value: unknown, inPosts: boolean, depth: number) => {
    if (depth > 6 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, inPosts, depth + 1);
      return;
    }
    const row = value as Record<string, unknown>;
    if (inPosts && typeof row.id === "number" && typeof row.title === "string") {
      const id = String(row.id);
      if (!found.has(id)) {
        found.set(id, {
          id,
          title: row.title.slice(0, 300),
          at: toIso(row.posted_at) ?? toIso(row.converted_at) ?? toIso(row.created_at) ?? null,
        });
      }
      return;
    }
    for (const [key, child] of Object.entries(row)) visit(child, inPosts || /post/i.test(key), depth + 1);
  };
  visit(data, false, 0);
  return [...found.values()]
    .sort((a, b) => (a.at && b.at ? (a.at < b.at ? 1 : -1) : Number(b.id) - Number(a.id)))
    .slice(0, MAX_POSTS);
}

export async function fantiaPosts(clubId: string): Promise<FantiaPost[]> {
  if (!/^\d{1,12}$/.test(clubId)) return [];
  const hit = cache.get(clubId);
  if (hit && Date.now() - hit.at < TTL) return hit.posts;
  try {
    const page = await safeFetchText(`https://fantia.jp/api/v1/fanclubs/${clubId}`, { headers: HEADERS });
    const posts = postsFromFantia(JSON.parse(page.text));
    cache.set(clubId, { posts, at: Date.now() });
    return posts;
  } catch {
    cache.set(clubId, { posts: [], at: Date.now() - TTL + 10 * 60 * 1000 });
    return [];
  }
}
