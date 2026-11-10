import "server-only";
import { safeFetchText } from "@/lib/fetchers/safe-fetch";

// Instagram のアカウントの公開の埋め込みページ(/<ID>/embed/)から、最新の投稿のコードを読む。
// 投稿は保存せず、表示は Instagram 公式の投稿埋め込み(/p/<コード>/embed/)で行う。
// 同じアカウントを何度も見に行かないよう、サーバーの中で1時間覚えておく。

const cache = new Map<string, { codes: string[]; at: number }>();
const TTL = 60 * 60 * 1000;
const MAX_POSTS = 9;

export function postCodesFromEmbed(html: string): string[] {
  const codes: string[] = [];
  const add = (code: string) => {
    if (!codes.includes(code)) codes.push(code);
  };
  // ページの中では、JSON が文字列の中にさらに入っていて引用符や / が「\"」「\/」のように書かれていることがある
  const patterns = [
    /shortcode\\*"\s*:\s*\\*"([A-Za-z0-9_-]{6,20})/g,
    /\\*"code\\*"\s*:\s*\\*"([A-Za-z0-9_-]{8,20})\\*"/g,
    /\/(?:p|reel|tv)\\*\/([A-Za-z0-9_-]{6,20})(?=\\*\/|\?|")/g,
    /\\u002F(?:p|reel)\\u002F([A-Za-z0-9_-]{6,20})/g,
  ];
  for (const pattern of patterns) for (const match of html.matchAll(pattern)) add(match[1]);
  return codes.slice(0, MAX_POSTS);
}

// 確認用: 投稿の手がかりになりそうな部分を少しだけ切り出す(個人情報になりうる本文は出さない)
function hints(html: string): Record<string, unknown> {
  const marks = ["shortcode", "/p/", "\\/p\\/", "u002Fp", "edge_owner", "\"code\"", "EmbedSimple", "Media", "contextJSON", "gql_data"];
  const result: Record<string, unknown> = {};
  for (const mark of marks) {
    const at = html.indexOf(mark);
    result[mark] = at < 0 ? null : html.slice(Math.max(0, at - 40), at + 80).replace(/[^\x20-\x7E]/g, "?");
  }
  return result;
}

// 読み取りの様子(マスター向けの確認用)。中身は返さず、転送先・大きさ・見つかった件数だけ
export async function instagramProbe(handle: string): Promise<Record<string, unknown>> {
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return { error: "IDの形が正しくありません" };
  try {
    const page = await safeFetchText(`https://www.instagram.com/${handle}/embed/`, { headers: HEADERS });
    return {
      finalUrl: page.finalUrl,
      contentType: page.contentType,
      bytes: page.text.length,
      loginWall: /accounts\/login|loginForm/i.test(page.text),
      codes: postCodesFromEmbed(page.text).length,
      hints: hints(page.text),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "取得できませんでした" };
  }
}

const HEADERS = {
  accept: "text/html",
  "accept-language": "ja,en;q=0.8",
  "user-agent": "Mozilla/5.0 (compatible; OshiOboretaiBot/1.0)",
};

export async function instagramPostCodes(handle: string): Promise<string[]> {
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return [];
  const hit = cache.get(handle);
  if (hit && Date.now() - hit.at < TTL) return hit.codes;
  try {
    const page = await safeFetchText(`https://www.instagram.com/${handle}/embed/`, { headers: HEADERS });
    const codes = postCodesFromEmbed(page.text);
    cache.set(handle, { codes, at: Date.now() });
    return codes;
  } catch {
    // 読めなかったときは、しばらく見に行かない(アカウントの埋め込み表示に戻す)
    cache.set(handle, { codes: [], at: Date.now() - TTL + 10 * 60 * 1000 });
    return [];
  }
}

// 投稿1件の埋め込みページから、写真(動画なら表紙の画像)のURLを読む。写真は保存せず、Instagram から直接表示する。
const mediaCache = new Map<string, { image: string | null; video: boolean; at: number }>();

export function mediaFromPostEmbed(html: string): { image: string | null; video: boolean } {
  const clean = (value: string) =>
    value
      .replace(/\\+u0026/g, "&")
      .replace(/\\+\//g, "/")
      .replace(/&amp;/g, "&");
  const image =
    /class="EmbeddedMediaImage"[^>]*?src="([^"]+)"/.exec(html)?.[1] ??
    /<img[^>]+class="EmbeddedMediaImage"[^>]*>/.exec(html)?.[0].match(/src="([^"]+)"/)?.[1] ??
    /display_url\\*"\s*:\s*\\*"(https?:[^"]+?)\\*"/.exec(html)?.[1] ??
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html)?.[1] ??
    null;
  const url = image ? clean(image) : null;
  const safe = url && /^https:\/\/[a-z0-9.-]+\.(cdninstagram\.com|fbcdn\.net)\//i.test(url) ? url : null;
  return { image: safe, video: /\\*"is_video\\*"\s*:\s*true|EmbedVideo|"video_url"/.test(html) };
}

export async function instagramPostMedia(code: string): Promise<{ image: string | null; video: boolean }> {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(code)) return { image: null, video: false };
  const hit = mediaCache.get(code);
  if (hit && Date.now() - hit.at < TTL) return { image: hit.image, video: hit.video };
  try {
    const page = await safeFetchText(`https://www.instagram.com/p/${code}/embed/`, { headers: HEADERS });
    const media = mediaFromPostEmbed(page.text);
    mediaCache.set(code, { ...media, at: Date.now() });
    return media;
  } catch {
    return { image: null, video: false };
  }
}
