import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fantiaClubId, fantiaPosts } from "@/lib/fetchers/fantia";
import { instagramPostCodes } from "@/lib/fetchers/instagram";
import { tiktokVideos } from "@/lib/fetchers/tiktok";
import { xPosts } from "@/lib/fetchers/x";

// X・Instagram・TikTok の定期取得。アカウントごとに次の取得時刻を持ち、時刻が来たものだけを読む。
// 公式APIではなく公開ページを読むため、間隔は控えめにし、失敗が続くほど空ける。

export type SocialPlatform = "x" | "instagram" | "tiktok" | "fantia";
type AccountRow = { platform: SocialPlatform; handle: string; last_fetched_at: string | null; error_count: number };
export type SocialPost = { key: string; at: string | null; title?: string };

const MINUTE = 60 * 1000;
// 取得の間隔(分)。環境変数で変えられる
const INTERVAL: Record<SocialPlatform, number> = {
  x: Number(process.env.X_INTERVAL_MINUTES ?? 60),
  tiktok: Number(process.env.TIKTOK_INTERVAL_MINUTES ?? 60),
  instagram: Number(process.env.INSTAGRAM_INTERVAL_MINUTES ?? 120),
  fantia: Number(process.env.FANTIA_INTERVAL_MINUTES ?? 60),
};
const MAX_BACKOFF = 12 * 60 * MINUTE;

function intervalOf(platform: SocialPlatform): number {
  const minutes = INTERVAL[platform];
  return Math.max(30, Number.isFinite(minutes) ? minutes : 60) * MINUTE;
}

// 同じ時刻に集中しないよう、±10% ずらす
function jitter(ms: number): number {
  return Math.round(ms * (0.9 + Math.random() * 0.2));
}

export async function socialPostsOf(platform: SocialPlatform, handle: string): Promise<SocialPost[]> {
  const bare = handle.replace(/^@/, "");
  if (platform === "x") return (await xPosts(bare)).map((p) => ({ key: `x:${p.id}`, at: p.at }));
  if (platform === "tiktok") return (await tiktokVideos(bare)).map((v) => ({ key: `tt:${v.id}`, at: v.at }));
  if (platform === "fantia") {
    const club = fantiaClubId(bare);
    return club ? (await fantiaPosts(club)).map((p) => ({ key: `fa:${p.id}`, at: p.at, title: p.title })) : [];
  }
  return (await instagramPostCodes(bare)).map((code) => ({ key: `ig:${code}`, at: null }));
}

// 読めた投稿を記録する(すでにある投稿は、見つけた時刻を変えない)。
// baseline: そのアカウントを初めて読んだときの投稿(SNS を登録する前からある投稿なので未読に数えない)
export async function recordSocialPosts(
  admin: SupabaseClient,
  platform: SocialPlatform,
  handle: string,
  posts: SocialPost[],
  baseline: boolean,
): Promise<void> {
  if (posts.length === 0) return;
  const key = handle.replace(/^@/, "").toLowerCase();
  await admin.from("oshikatsu_social_posts").upsert(
    posts.map((p) => ({ platform, handle: key, post_key: p.key, posted_at: p.at, title: p.title ?? null, baseline })),
    { onConflict: "platform,handle,post_key", ignoreDuplicates: true },
  );
  // 一覧に見えている投稿は、最後に見えた時刻を進める(見えている間は片付けない)
  await admin
    .from("oshikatsu_social_posts")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("platform", platform)
    .eq("handle", key)
    .in("post_key", posts.map((p) => p.key));
}

// 時刻が来たアカウントをまとめて読む。同時に読むのは4件まで、時間は最大 timeLimitMs まで
export async function runDueSocial(admin: SupabaseClient, timeLimitMs: number) {
  const started = Date.now();
  const totals = { claimed: 0, ok: 0, failed: 0 };
  while (Date.now() - started < timeLimitMs) {
    const { data, error } = await admin.rpc("oshikatsu_claim_social_accounts", { batch: 40 });
    if (error) throw new Error(`取得対象の確保に失敗しました: ${error.message}`);
    const accounts = (data ?? []) as AccountRow[];
    totals.claimed += accounts.length;

    const queue = [...accounts];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (let account = queue.shift(); account; account = queue.shift()) {
        if (Date.now() - started > timeLimitMs + 10_000) break;
        let posts: SocialPost[] = [];
        try {
          posts = await socialPostsOf(account.platform, account.handle);
        } catch {
          posts = [];
        }
        const now = Date.now();
        if (posts.length > 0) {
          await recordSocialPosts(admin, account.platform, account.handle, posts, account.last_fetched_at === null);
          await admin
            .from("oshikatsu_social_accounts")
            .update({
              last_fetched_at: new Date(now).toISOString(),
              next_fetch_at: new Date(now + jitter(intervalOf(account.platform))).toISOString(),
              error_count: 0,
              last_error: null,
            })
            .eq("platform", account.platform)
            .eq("handle", account.handle);
          totals.ok++;
        } else {
          // 読めなかった(投稿が0件のときも含む)。続くほど間隔を空ける(最大12時間)
          const errors = account.error_count + 1;
          const backoff = Math.min(MAX_BACKOFF, intervalOf(account.platform) * 2 ** Math.min(errors, 4));
          await admin
            .from("oshikatsu_social_accounts")
            .update({
              next_fetch_at: new Date(now + jitter(backoff)).toISOString(),
              error_count: errors,
              last_error: "投稿を読めませんでした",
            })
            .eq("platform", account.platform)
            .eq("handle", account.handle);
          totals.failed++;
        }
      }
    });
    await Promise.all(workers);
    if (accounts.length < 40) break;
  }
  return totals;
}

// 推しを開いたときに読んだ投稿も記録する(定期取得を待たずに、見つけた時刻を残す)。
// まだ一度も読んでいないアカウントなら、今ある投稿は登録前からの投稿として扱う
export async function recordLiveSocial(admin: SupabaseClient, platform: SocialPlatform, handle: string, posts: SocialPost[]) {
  if (posts.length === 0) return;
  const key = handle.replace(/^@/, "").toLowerCase();
  const { data } = await admin
    .from("oshikatsu_social_accounts")
    .select("last_fetched_at")
    .eq("platform", platform)
    .eq("handle", key)
    .maybeSingle();
  const first = !(data as { last_fetched_at?: string | null } | null)?.last_fetched_at;
  await recordSocialPosts(admin, platform, key, posts, first);
  if (first) {
    await admin
      .from("oshikatsu_social_accounts")
      .upsert({ platform, handle: key, last_fetched_at: new Date().toISOString() }, { onConflict: "platform,handle" });
  }
}
