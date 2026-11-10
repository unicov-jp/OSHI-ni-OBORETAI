import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// 今のアプリ(推し活手帳)で Google ドライブに接続した人は、リフレッシュトークンが
// oshikatsu_gdrive_tokens に本人の行として保存されている(/api/gdrive-token)。
// それを本人のセッションで読み、OAuth クライアントシークレットでアクセストークンに換える。
// アクセストークンはサーバーの中だけで使い、ブラウザへは返さない。

const cache = new Map<string, { token: string; exp: number }>();

export function driveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export async function driveAccessToken(supabase: SupabaseClient, userId: string): Promise<string | null> {
  if (!driveConfigured()) return null;
  const hit = cache.get(userId);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const { data } = await supabase
    .from("oshikatsu_gdrive_tokens")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  const refresh = data?.refresh_token as string | undefined;
  if (!refresh) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refresh,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }).toString(),
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) return null;
  cache.set(userId, { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}
