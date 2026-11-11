import { NextResponse } from "next/server";
import { parseAccountUrl } from "@/lib/platforms";
import { clubNameFromFantia, postsFromFantia } from "@/lib/fetchers/fantia";
import { safeFetchText } from "@/lib/fetchers/safe-fetch";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// マスター向け: Fantia・myfans・xfans・FANZA の投稿(タイトル・日付)をサーバーから読み取れるかを確かめる。
// 何も付けずに開くと、自分が登録したこれらのURLをすべて調べる。?url=… で1件だけ調べることもできる。
// 本文や画像は読まない(ページの先頭と、投稿の一覧らしき部分の有無・件数だけを返す)

const HEADERS = {
  accept: "text/html,application/json;q=0.9,*/*;q=0.8",
  "accept-language": "ja,en;q=0.8",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

type Probe = {
  label: string;
  url: string;
  ok: boolean;
  error?: string;
  finalUrl?: string;
  contentType?: string;
  bytes?: number;
  title?: string | null;
  redirectedToLogin?: boolean;
  postLinks?: number;
  postLinkSamples?: string[];
  dates?: number;
  jsonKeys?: string[];
  jsonPreview?: string;
  // Fantia: アプリが実際に読み取る投稿(先頭3件)と件数
  parsedPosts?: { clubName: string; count: number; samples: { id: string; title: string; at: string | null; thumb: string | null }[] };
};

// 調べるURLの候補(公開ページと、サイトが画面を作るのに使っている読み取り用の窓口)
function candidates(platform: string, url: string, handle: string): { label: string; url: string; postPattern: RegExp }[] {
  const bare = handle.replace(/^@/, "");
  if (platform === "fantia") {
    const id = /fanclubs\/(\d+)/.exec(url)?.[1] ?? "";
    return [
      { label: "ファンクラブのページ", url: `https://fantia.jp/fanclubs/${id}`, postPattern: /\/posts\/\d+/g },
      { label: "投稿一覧のページ", url: `https://fantia.jp/fanclubs/${id}/posts`, postPattern: /\/posts\/\d+/g },
      { label: "読み取り用の窓口(ファンクラブ)", url: `https://fantia.jp/api/v1/fanclubs/${id}`, postPattern: /"id":\s*\d+[^{}]{0,200}"title"/g },
    ];
  }
  if (platform === "myfans") {
    return [
      { label: "プロフィールのページ", url: `https://myfans.jp/${bare}`, postPattern: /\/posts\/[A-Za-z0-9-]+/g },
      { label: "読み取り用の窓口(利用者)", url: `https://api.myfans.jp/api/v2/users/show_by_username?username=${encodeURIComponent(bare)}`, postPattern: /"posts_count"|"id":"[0-9a-f-]{36}"/g },
    ];
  }
  if (platform === "xfans") {
    return [
      { label: "プロフィールのページ", url: `https://www.xfans.tokyo/${bare}`, postPattern: /\/(posts?|contents?)\/[A-Za-z0-9_-]+/g },
    ];
  }
  return [{ label: "登録したページ", url, postPattern: /\/(cid|content_id)=[A-Za-z0-9_]+|\/detail\/=\/cid=[A-Za-z0-9_]+/g }];
}

async function probe(label: string, url: string, postPattern: RegExp): Promise<Probe> {
  try {
    const page = await safeFetchText(url, { headers: HEADERS });
    const text = page.text;
    const result: Probe = {
      label,
      url,
      ok: true,
      finalUrl: page.finalUrl,
      contentType: page.contentType,
      bytes: text.length,
      title: /<title[^>]*>([^<]{0,120})/i.exec(text)?.[1]?.trim() ?? null,
      redirectedToLogin: /login|signin|sign_in|age_check|age-check/i.test(page.finalUrl),
      dates: (text.match(/20\d\d[-/.年]\d{1,2}[-/.月]\d{1,2}/g) ?? []).length,
    };
    const links = [...new Set(text.match(postPattern) ?? [])];
    result.postLinks = links.length;
    result.postLinkSamples = links.slice(0, 3).map((s) => s.slice(0, 80));
    if (page.contentType.includes("json")) {
      try {
        const data = JSON.parse(text) as Record<string, unknown>;
        result.jsonKeys = Object.keys(data).slice(0, 20);
        if (url.startsWith("https://fantia.jp/api/")) {
          const posts = postsFromFantia(data);
          result.parsedPosts = { clubName: clubNameFromFantia(data), count: posts.length, samples: posts.slice(0, 3) };
        }
      } catch {
        // JSON として読めなかった
      }
      result.jsonPreview = text.slice(0, 300);
    }
    return result;
  } catch (error) {
    return { label, url, ok: false, error: error instanceof Error ? error.message : "不明なエラー" };
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  const { data: profile } = await supabase.from("oshikatsu_profiles").select("plan").eq("user_id", user.id).maybeSingle();
  if (profile?.plan !== "master") return NextResponse.json({ error: "マスターだけが使えます" }, { status: 403 });

  const one = new URL(request.url).searchParams.get("url");
  let targets: { platform: string; url: string; handle: string }[] = [];
  if (one) {
    const parsed = parseAccountUrl(one);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    targets = [{ platform: parsed.platform, url: parsed.url, handle: parsed.handle }];
  } else {
    const { data } = await supabase
      .from("oshikatsu_sources")
      .select("platform, url, handle")
      .in("platform", ["fantia", "myfans", "xfans", "fanza"])
      .limit(10);
    targets = (data ?? []) as typeof targets;
  }
  if (targets.some((t) => !["fantia", "myfans", "xfans", "fanza"].includes(t.platform))) {
    return NextResponse.json({ error: "Fantia・myfans・xfans・FANZA のURLだけを調べられます" }, { status: 400 });
  }

  const results = [];
  for (const target of targets) {
    const probes = await Promise.all(candidates(target.platform, target.url, target.handle).map((c) => probe(c.label, c.url, c.postPattern)));
    results.push({ platform: target.platform, url: target.url, probes });
  }
  return NextResponse.json({ checkedAt: new Date().toISOString(), results }, { headers: { "Cache-Control": "no-store" } });
}
