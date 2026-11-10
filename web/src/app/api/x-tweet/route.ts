import { NextResponse } from "next/server";
import { xTweet } from "@/lib/fetchers/x";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// X の投稿1件の中身(本文・写真・動画のURL)を返す(ログイン中の利用者だけ)。写真・動画は中継も保存もしない。
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const tweet = await xTweet(id);
  if (!tweet) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(tweet, { headers: { "Cache-Control": "private, max-age=1800" } });
}
