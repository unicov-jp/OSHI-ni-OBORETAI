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

// ---- 写真の保存(今のアプリと同じ置き場所: 「推し活手帳」フォルダの中の Gallery・チェキ・LIVE) ----
// 権限は drive.file(このアプリが作ったファイル・フォルダだけを扱える)。今のアプリと同じ OAuth クライアントを使うので、
// 今のアプリが作ったフォルダをそのまま使える。

const ROOT_FOLDER = "推し活手帳";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const folderCache = new Map<string, string>();

async function driveJson(token: string, url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`drive ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

async function ensureFolder(token: string, userId: string, name: string, parent: string | null): Promise<string> {
  const cacheKey = `${userId}:${parent ?? "root"}:${name}`;
  const hit = folderCache.get(cacheKey);
  if (hit) return hit;
  const q = [`name='${name.replace(/'/g, "\\'")}'`, `mimeType='${FOLDER_MIME}'`, "trashed=false", parent ? `'${parent}' in parents` : ""]
    .filter(Boolean)
    .join(" and ");
  const found = await driveJson(
    token,
    `https://www.googleapis.com/drive/v3/files?spaces=drive&orderBy=createdTime&fields=files(id)&q=${encodeURIComponent(q)}`,
  );
  const files = (found.files as { id: string }[] | undefined) ?? [];
  let id = files[0]?.id;
  if (!id) {
    const created = await driveJson(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parent ? { parents: [parent] } : {}) }),
    });
    id = created.id as string;
  }
  folderCache.set(cacheKey, id);
  return id;
}

// 写真を1枚ドライブへ保存し、記録に入れる置き場所(gdrive:<ファイルID>)を返す
export async function uploadPhotoToDrive(
  token: string, userId: string, sub: "Gallery" | "チェキ" | "LIVE", fileName: string, bytes: ArrayBuffer, type: string,
): Promise<string> {
  const root = await ensureFolder(token, userId, ROOT_FOLDER, null);
  const parent = await ensureFolder(token, userId, sub, root);
  const boundary = `oshikatsu${crypto.randomUUID().replace(/-/g, "")}`;
  const meta = JSON.stringify({ name: fileName, parents: [parent], mimeType: type });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
    bytes,
    `\r\n--${boundary}--`,
  ]);
  const result = await driveJson(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return `gdrive:${result.id as string}`;
}
