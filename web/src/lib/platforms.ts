import type { Platform, SourceMode } from "@/lib/types";

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube",
  blog: "Blog",
  x: "X",
  instagram: "Instagram",
  threads: "Threads",
  tiktok: "TikTok",
  link: "リンク",
  fantia: "Fantia",
  myfans: "myfans",
  xfans: "xfans",
  fanza: "FANZA",
};

// Advanced プランだけが登録できるサービス
export const ADVANCED_PLATFORMS: Platform[] = ["fantia", "myfans", "xfans", "fanza"];

// ロゴの代わりに使う短い記号(各社のロゴ画像は使わない)
export const PLATFORM_MARK: Record<Platform, string> = {
  youtube: "YT",
  blog: "Blog",
  x: "X",
  instagram: "IG",
  threads: "Th",
  tiktok: "TT",
  link: "URL",
  fantia: "Fa",
  myfans: "mf",
  xfans: "xf",
  fanza: "FZ",
};

export const PLATFORM_EXAMPLE: Record<Platform, string> = {
  youtube: "https://www.youtube.com/@handle",
  blog: "https://ameblo.jp/example/",
  x: "https://x.com/handle",
  instagram: "https://www.instagram.com/handle/",
  threads: "https://www.threads.com/@handle",
  tiktok: "https://www.tiktok.com/@handle",
  link: "https://example.com/",
  fantia: "https://fantia.jp/fanclubs/12345",
  myfans: "https://myfans.jp/handle",
  xfans: "https://www.xfans.tokyo/handle",
  fanza: "https://www.dmm.co.jp/digital/videoa/-/list/=/article=actress/id=12345/",
};

export const PLATFORM_ORDER: Platform[] = ["youtube", "blog", "x", "instagram", "threads", "tiktok", "fantia", "myfans", "xfans", "fanza", "link"];

// 各サービスの表示名の横に置く短い説明。利用者が「何がどう表示されるか」を登録前に分かるようにする。
export const PLATFORM_HOW: Record<Platform, string> = {
  youtube: "新着動画を自動で取得します",
  blog: "新着記事を自動で取得します",
  x: "公式の埋め込みで表示します",
  instagram: "公式の埋め込みで表示します",
  threads: "プロフィールへのリンクとして保存します",
  tiktok: "公式の埋め込みで表示します",
  link: "リンクとして保存します",
  fantia: "ファンクラブへのリンクとして保存します",
  myfans: "プロフィールへのリンクとして保存します",
  xfans: "プロフィールへのリンクとして保存します",
  fanza: "作品一覧・女優ページへのリンクとして保存します",
};

export type ParsedAccount = {
  platform: Platform;
  mode: SourceMode;
  url: string;
  handle: string;
  // YouTube のみ: /channel/UC... 形式ならチャンネルID、@handle 形式ならハンドル
  youtube?: { channelId?: string; handle?: string };
};

const HANDLE_RULES = {
  x: /^[A-Za-z0-9_]{1,15}$/,
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
  youtubeHandle: /^[\p{L}\p{N}._-]{3,30}$/u,
  youtubeChannel: /^UC[A-Za-z0-9_-]{22}$/,
};

const X_RESERVED = new Set([
  "home", "explore", "search", "i", "settings", "notifications", "messages", "intent", "share", "hashtag", "login", "signup",
]);
const INSTAGRAM_RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv", "direct"]);

function host(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
}

// 入力されたURLから、どのサービスのどのアカウントかを判定する。
// 埋め込みURLに差し込む値はここで厳格に検証し、想定外の文字列が混ざらないようにする。
export function parseAccountUrl(input: string): ParsedAccount | { error: string } {
  let raw = input.trim();
  if (!raw) return { error: "URLを入力してください" };
  if (raw.length > 500) return { error: "URLが長すぎます(500文字まで)" };
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "URLの形式が正しくありません" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { error: "http または https のURLを入力してください" };
  }
  if (url.username || url.password) return { error: "ユーザー名やパスワードを含むURLは登録できません" };

  const h = host(url);
  const segments = url.pathname.split("/").filter(Boolean).map((s) => safeDecode(s));

  if (h === "youtube.com" || h === "youtu.be") {
    const first = segments[0] ?? "";
    if (first.startsWith("@")) {
      const handle = first.slice(1);
      if (!HANDLE_RULES.youtubeHandle.test(handle)) return { error: "YouTubeのハンドルが正しくありません" };
      return {
        platform: "youtube",
        mode: "feed",
        url: `https://www.youtube.com/@${encodeURIComponent(handle)}`,
        handle: `@${handle}`,
        youtube: { handle },
      };
    }
    if (first === "channel" && HANDLE_RULES.youtubeChannel.test(segments[1] ?? "")) {
      return {
        platform: "youtube",
        mode: "feed",
        url: `https://www.youtube.com/channel/${segments[1]}`,
        handle: segments[1],
        youtube: { channelId: segments[1] },
      };
    }
    return {
      error: "YouTubeはチャンネルのURLを入力してください(例: https://www.youtube.com/@handle)",
    };
  }

  if (h === "x.com" || h === "twitter.com") {
    const handle = (segments[0] ?? "").replace(/^@/, "");
    if (!HANDLE_RULES.x.test(handle) || X_RESERVED.has(handle.toLowerCase())) {
      return { error: "XはプロフィールのURLを入力してください(例: https://x.com/handle)" };
    }
    return { platform: "x", mode: "embed", url: `https://x.com/${handle}`, handle: `@${handle}` };
  }

  if (h === "instagram.com") {
    const handle = segments[0] ?? "";
    if (!HANDLE_RULES.instagram.test(handle) || INSTAGRAM_RESERVED.has(handle.toLowerCase())) {
      return { error: "InstagramはプロフィールのURLを入力してください(例: https://www.instagram.com/handle)" };
    }
    return {
      platform: "instagram",
      mode: "embed",
      url: `https://www.instagram.com/${handle}/`,
      handle: `@${handle}`,
    };
  }

  if (h === "threads.net" || h === "threads.com") {
    const first = segments[0] ?? "";
    const handle = first.startsWith("@") ? first.slice(1) : "";
    if (!HANDLE_RULES.instagram.test(handle)) {
      return { error: "ThreadsはプロフィールのURLを入力してください(例: https://www.threads.com/@handle)" };
    }
    return { platform: "threads", mode: "link", url: `https://www.threads.com/@${handle}`, handle: `@${handle}` };
  }

  if (h === "tiktok.com") {
    const first = segments[0] ?? "";
    const handle = first.startsWith("@") ? first.slice(1) : "";
    if (!HANDLE_RULES.tiktok.test(handle)) {
      return { error: "TikTokはプロフィールのURLを入力してください(例: https://www.tiktok.com/@handle)" };
    }
    return { platform: "tiktok", mode: "embed", url: `https://www.tiktok.com/@${handle}`, handle: `@${handle}` };
  }

  // ファン向けの有料サービス(Advanced プラン)。中身は会員限定なので取りに行かず、ページへのリンクとして保存する
  if (h === "fantia.jp") {
    const first = segments[0] ?? "";
    const id = segments[1] ?? "";
    if (first !== "fanclubs" || !/^\d{1,12}$/.test(id)) {
      return { error: "Fantiaはファンクラブのページのアドレスを入力してください(例: https://fantia.jp/fanclubs/12345)" };
    }
    return { platform: "fantia", mode: "link", url: `https://fantia.jp/fanclubs/${id}`, handle: `fanclubs/${id}` };
  }
  if (h === "myfans.jp") {
    const handle = (segments[0] ?? "").replace(/^@/, "");
    if (!/^[A-Za-z0-9._-]{1,50}$/.test(handle)) {
      return { error: "myfansはプロフィールのアドレスを入力してください(例: https://myfans.jp/handle)" };
    }
    return { platform: "myfans", mode: "link", url: `https://myfans.jp/${handle}`, handle: `@${handle}` };
  }
  if (h === "xfans.tokyo") {
    const handle = (segments[0] ?? "").replace(/^@/, "");
    if (!/^[A-Za-z0-9._-]{1,50}$/.test(handle)) {
      return { error: "xfansはプロフィールのアドレスを入力してください(例: https://www.xfans.tokyo/handle)" };
    }
    return { platform: "xfans", mode: "link", url: `https://www.xfans.tokyo/${handle}`, handle: `@${handle}` };
  }
  // FANZA(DMM)。女優・作品一覧などのページをそのまま保存する(トップページは推しのページではないので受け付けない)
  if (h === "fanza.jp" || h.endsWith(".fanza.jp") || h === "dmm.co.jp" || h.endsWith(".dmm.co.jp")) {
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === "/top" || segments.length === 0) {
      return { error: "FANZAは推しの女優ページや作品一覧のアドレスを入力してください(トップページは登録できません)" };
    }
    const saved = `https://${url.hostname.toLowerCase()}${url.pathname}${url.search}`;
    if (saved.length > 300) return { error: "FANZAのアドレスが長すぎます" };
    const actress = /(?:^|\/)id=(\d{1,12})(?:\/|$)/.exec(url.pathname)?.[1] ?? url.searchParams.get("actress") ?? "";
    const handle = /^\d{1,12}$/.test(actress) ? `actress/${actress}` : (segments[segments.length - 1] ?? "").slice(0, 60);
    return { platform: "fanza", mode: "link", url: saved, handle };
  }

  // それ以外はBlog候補。フィード(RSS/Atom)が見つかれば自動取得、なければリンクとして保存する。
  url.hash = "";
  return { platform: "blog", mode: "feed", url: url.toString(), handle: h };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// 埋め込み用のハンドル(先頭の@を除く)。検証済みの値だけを返す。
export function embedHandle(platform: Platform, handle: string): string | null {
  const bare = handle.replace(/^@/, "");
  if (platform === "x") return HANDLE_RULES.x.test(bare) ? bare : null;
  if (platform === "instagram") return HANDLE_RULES.instagram.test(bare) ? bare : null;
  if (platform === "tiktok") return HANDLE_RULES.tiktok.test(bare) ? bare : null;
  return null;
}

export function youtubeVideoId(url: string): string | null {
  const match = /[?&]v=([A-Za-z0-9_-]{11})(?:&|$)/.exec(url) ?? /\/shorts\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/.exec(url);
  return match ? match[1] : null;
}

// YouTube ショート(縦長)か
export function isYoutubeShort(url: string): boolean {
  return /youtube\.com\/shorts\//.test(url);
}

// メンバーカラーの候補。
export const MEMBER_COLORS: { name: string; value: string }[] = [
  { name: "赤", value: "#E5484D" },
  { name: "ピンク", value: "#EC6FA9" },
  { name: "オレンジ", value: "#F08A24" },
  { name: "黄", value: "#E8C21A" },
  { name: "黄緑", value: "#8CC63F" },
  { name: "緑", value: "#2FA36B" },
  { name: "ミント", value: "#5FD3B4" },
  { name: "水色", value: "#3FC8E4" },
  { name: "青", value: "#3B6FE0" },
  { name: "紫", value: "#8E5AD6" },
  { name: "白", value: "#E9EEF2" },
  { name: "黒", value: "#2B3640" },
];
