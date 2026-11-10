import { NextResponse } from "next/server";
import { DEMO } from "@/lib/env";
import { instagramPostCodes } from "@/lib/fetchers/instagram";
import { tiktokVideos } from "@/lib/fetchers/tiktok";
import { xPosts } from "@/lib/fetchers/x";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// X・Instagram・TikTok の未読の投稿(推しごと)。
// 登録してある全アカウントの最新の投稿を読み、まだ覚えていない投稿を記録して、まだ表示していないものを返す。
// SNS を登録した時点ですでにあった投稿は未読に数えない。直近30日に見つけたものだけを数える

type SourceRow = { id: string; oshi_id: string; platform: "x" | "instagram" | "tiktok"; handle: string; created_at: string };
type StateRow = { source_id: string; post_key: string; first_seen_at: string; baseline: boolean; read_at: string | null };
type Post = { key: string; at: string | null };

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const KEEP_MS = 60 * 24 * 60 * 60 * 1000;

async function postsOf(platform: SourceRow["platform"], handle: string): Promise<Post[]> {
  const bare = handle.replace(/^@/, "");
  if (platform === "x") return (await xPosts(bare)).map((p) => ({ key: `x:${p.id}`, at: p.at }));
  if (platform === "tiktok") return (await tiktokVideos(bare)).map((v) => ({ key: `tt:${v.id}`, at: v.at }));
  return (await instagramPostCodes(bare)).map((code) => ({ key: `ig:${code}`, at: null }));
}

// 同時に読みに行く数を抑える
async function mapLimit<T, R>(list: T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (next < list.length) {
        const index = next++;
        result[index] = await fn(list[index]);
      }
    }),
  );
  return result;
}

export async function GET() {
  if (DEMO) return NextResponse.json({ keys: {} });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });

  const { data: sourceData } = await supabase
    .from("oshikatsu_sources")
    .select("id, oshi_id, platform, handle, created_at")
    .in("platform", ["x", "instagram", "tiktok"]);
  const sources = (sourceData ?? []) as SourceRow[];
  if (sources.length === 0) return NextResponse.json({ keys: {} });

  const since = new Date(Date.now() - KEEP_MS).toISOString();
  // 古くなった記録は消す(60日より前に見つけた投稿)
  await supabase.from("oshikatsu_post_states").delete().eq("user_id", user.id).lt("first_seen_at", since);
  const { data: stateData } = await supabase
    .from("oshikatsu_post_states")
    .select("source_id, post_key, first_seen_at, baseline, read_at")
    .eq("user_id", user.id)
    .limit(5000);
  const states = (stateData ?? []) as StateRow[];

  // 同じアカウントは1回だけ読む
  const accounts = [...new Map(sources.map((s) => [`${s.platform}:${s.handle.toLowerCase()}`, s])).values()];
  const fetched = new Map<string, Post[]>();
  await mapLimit(accounts, 4, async (s) => {
    try {
      fetched.set(`${s.platform}:${s.handle.toLowerCase()}`, await postsOf(s.platform, s.handle));
    } catch {
      fetched.set(`${s.platform}:${s.handle.toLowerCase()}`, []);
    }
  });

  const readKeys = new Set(states.filter((r) => r.read_at).map((r) => r.post_key));
  const known = new Set(states.map((r) => `${r.source_id}|${r.post_key}`));
  const hasRows = new Set(states.map((r) => r.source_id));
  const now = new Date().toISOString();
  const inserts: Record<string, unknown>[] = [];
  for (const source of sources) {
    const posts = fetched.get(`${source.platform}:${source.handle.toLowerCase()}`) ?? [];
    // 読めなかったときは何も記録しない(次に読めたときに、まとめて既存の投稿として扱わないため)
    if (posts.length === 0) continue;
    const first = !hasRows.has(source.id);
    for (const post of posts) {
      if (known.has(`${source.id}|${post.key}`)) continue;
      const before = post.at ? post.at < source.created_at : false;
      const row = {
        user_id: user.id,
        source_id: source.id,
        post_key: post.key,
        posted_at: post.at,
        first_seen_at: now,
        baseline: first || before,
        read_at: readKeys.has(post.key) ? now : null,
      };
      inserts.push(row);
      states.push({ source_id: source.id, post_key: post.key, first_seen_at: now, baseline: row.baseline, read_at: row.read_at });
    }
  }
  if (inserts.length > 0) {
    await supabase.from("oshikatsu_post_states").upsert(inserts, { onConflict: "user_id,source_id,post_key", ignoreDuplicates: true });
  }

  const oshiOf = new Map(sources.map((s) => [s.id, s.oshi_id]));
  const windowStart = Date.now() - WINDOW_MS;
  const keys: Record<string, string[]> = {};
  for (const row of states) {
    if (row.baseline || row.read_at || readKeys.has(row.post_key)) continue;
    if (Date.parse(row.first_seen_at) < windowStart) continue;
    const oshi = oshiOf.get(row.source_id);
    if (!oshi) continue;
    const list = (keys[oshi] ??= []);
    if (!list.includes(row.post_key)) list.push(row.post_key);
  }
  return NextResponse.json({ keys }, { headers: { "Cache-Control": "private, no-store" } });
}
