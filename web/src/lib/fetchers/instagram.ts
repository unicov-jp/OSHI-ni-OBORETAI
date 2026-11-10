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
  for (const match of html.matchAll(/"shortcode"\s*:\s*"([A-Za-z0-9_-]{6,20})"/g)) add(match[1]);
  for (const match of html.matchAll(/instagram\.com\\?\/(?:p|reel)\\?\/([A-Za-z0-9_-]{6,20})/g)) add(match[1]);
  for (const match of html.matchAll(/href="\/(?:p|reel)\/([A-Za-z0-9_-]{6,20})\//g)) add(match[1]);
  return codes.slice(0, MAX_POSTS);
}

export async function instagramPostCodes(handle: string): Promise<string[]> {
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return [];
  const hit = cache.get(handle);
  if (hit && Date.now() - hit.at < TTL) return hit.codes;
  try {
    const page = await safeFetchText(`https://www.instagram.com/${handle}/embed/`, {
      headers: {
        accept: "text/html",
        "accept-language": "ja,en;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; OshiOboretaiBot/1.0)",
      },
    });
    const codes = postCodesFromEmbed(page.text);
    cache.set(handle, { codes, at: Date.now() });
    return codes;
  } catch {
    // 読めなかったときは、しばらく見に行かない(アカウントの埋め込み表示に戻す)
    cache.set(handle, { codes: [], at: Date.now() - TTL + 10 * 60 * 1000 });
    return [];
  }
}
