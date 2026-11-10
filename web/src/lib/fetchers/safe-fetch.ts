import "server-only";
import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

// 利用者が入力したURLをサーバーから取りに行くための安全な取得処理。
// 社内ネットワークやクラウドのメタデータ領域への到達(SSRF)を防ぐ:
//  * http/https の標準ポートのみ
//  * 名前解決の結果がすべて公開アドレスであること(接続時に検証するのでDNS切り替えにも耐える)
//  * リダイレクトは手動で追い、毎回同じ検証を行う
//  * 時間と本文サイズに上限

const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32],
  ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return !blocked.check(mapped[1], "ipv4");
    if (/^::ffff:/i.test(address)) return false;
    return !blocked.check(address, "ipv6");
  }
  return false;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

const guardedAgent = new Agent({
  connect: {
    lookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
      dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, []);
        const list = addresses as dns.LookupAddress[];
        if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
          const blockedError: NodeJS.ErrnoException = new Error("BLOCKED_ADDRESS");
          blockedError.code = "EBLOCKED";
          return callback(blockedError, []);
        }
        if (options.all) return callback(null, list);
        callback(null, list[0].address, list[0].family);
      });
    },
  },
  headersTimeout: 8000,
  bodyTimeout: 8000,
});

export class SafeFetchError extends Error {}

function assertAllowedUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SafeFetchError("http/https 以外のURLは取得できません");
  }
  if (url.username || url.password) throw new SafeFetchError("認証情報を含むURLは取得できません");
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  if (port !== "443" && port !== "80") throw new SafeFetchError("標準以外のポートは取得できません");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new SafeFetchError("このアドレスは取得できません");
  } else if (!hostname.includes(".") || /\.(local|internal|localhost)$/i.test(hostname)) {
    throw new SafeFetchError("このホスト名は取得できません");
  }
}

// Shift_JIS や EUC-JP の古いBlogでも文字化けしないよう、宣言された文字コードで読む。
function decodeBody(body: Buffer, contentType: string): string {
  const head = body.subarray(0, 1024).toString("latin1");
  const declared =
    /charset=["']?([\w-]+)/i.exec(contentType)?.[1] ??
    /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] ??
    /<meta[^>]*charset=["']?([\w-]+)/i.exec(head)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(declared).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export type SafeResponse = {
  finalUrl: string;
  contentType: string;
  text: string;
};

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

// truncateAt を指定すると、その大きさで読むのをやめて、そこまでの本文を返す(ページの先頭だけ要る場合)。
export async function safeFetchText(
  input: string,
  options: { truncateAt?: number; headers?: Record<string, string> } = {},
): Promise<SafeResponse> {
  let current = new URL(input);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertAllowedUrl(current);

    let response;
    try {
      response = await undiciFetch(current, {
        dispatcher: guardedAgent,
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        headers: {
          "user-agent": "OshiOboretaiBot/1.0 (feed reader)",
          accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8",
          ...options.headers,
        },
      });
    } catch (error) {
      const cause = (error as { cause?: { code?: string } }).cause;
      if (cause?.code === "EBLOCKED") throw new SafeFetchError("このアドレスは取得できません");
      throw new SafeFetchError("接続できませんでした");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new SafeFetchError("転送先が不明です");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new SafeFetchError(`取得に失敗しました(HTTP ${response.status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new SafeFetchError("本文を取得できませんでした");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (options.truncateAt && total >= options.truncateAt) {
        chunks.push(value);
        await reader.cancel();
        break;
      }
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new SafeFetchError("データが大きすぎます(2MBまで)");
      }
      chunks.push(value);
    }

    const contentType = response.headers.get("content-type") ?? "";
    return {
      finalUrl: current.toString(),
      contentType,
      text: decodeBody(Buffer.concat(chunks), contentType),
    };
  }

  throw new SafeFetchError("転送が多すぎます");
}
