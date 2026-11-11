import "server-only";
import { safeFetchText } from "@/lib/fetchers/safe-fetch";

// Fantia のファンクラブの最新の投稿(番号・タイトル・投稿日)を、サイトが画面を作るのに使っている読み取り用の窓口から読む。
// 本文や画像は会員限定なので読まない。同じファンクラブは1時間に1回まで見に行く。
// Fantia の都合で予告なく使えなくなることがある。

export type FantiaPost = { id: string; title: string; at: string | null; thumb: string | null };
export type FantiaClub = { name: string; posts: FantiaPost[] };

const cache = new Map<string, { club: FantiaClub; at: number }>();
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

// 投稿の画像(公開されているサムネイル)。大きいものから選ぶ
const THUMB_KEYS = ["main", "large", "ogp", "medium", "original", "thumb", "small", "micro"];
function thumbOf(row: Record<string, unknown>): string | null {
  const ok = (value: unknown) => (typeof value === "string" && /^https:\/\/[a-z0-9.-]*fantia\.jp\//.test(value) ? value : null);
  const thumb = row.thumb;
  if (thumb && typeof thumb === "object") {
    const t = thumb as Record<string, unknown>;
    for (const key of THUMB_KEYS) {
      const hit = ok(t[key]);
      if (hit) return hit;
    }
  }
  return ok(thumb) ?? ok(row.thumb_micro) ?? null;
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
          thumb: thumbOf(row),
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

// ファンクラブの名前(「ファンクラブ名 (クリエイター名)」の形があればそれを使う)
export function clubNameFromFantia(data: unknown): string {
  const club = (data as { fanclub?: Record<string, unknown> } | null)?.fanclub;
  if (!club) return "";
  for (const key of ["fanclub_name_with_creator_name", "name", "fanclub_name", "creator_name", "title"]) {
    const value = club[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
  }
  return "";
}

export async function fantiaClub(clubId: string): Promise<FantiaClub> {
  if (!/^\d{1,12}$/.test(clubId)) return { name: "", posts: [] };
  const hit = cache.get(clubId);
  if (hit && Date.now() - hit.at < TTL) return hit.club;
  try {
    const page = await safeFetchText(`https://fantia.jp/api/v1/fanclubs/${clubId}`, { headers: HEADERS });
    const data = JSON.parse(page.text) as unknown;
    const club = { name: clubNameFromFantia(data), posts: postsFromFantia(data) };
    cache.set(clubId, { club, at: Date.now() });
    return club;
  } catch {
    const club = { name: "", posts: [] };
    cache.set(clubId, { club, at: Date.now() - TTL + 10 * 60 * 1000 });
    return club;
  }
}

export async function fantiaPosts(clubId: string): Promise<FantiaPost[]> {
  return (await fantiaClub(clubId)).posts;
}
