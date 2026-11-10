import { NextResponse } from "next/server";
import { instagramPostMedia } from "@/lib/fetchers/instagram";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Instagram の投稿1件の写真のURLを返す(ログイン中の利用者だけ)。写真そのものは中継も保存もしない。
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const media = await instagramPostMedia(code);
  return NextResponse.json(media, { headers: { "Cache-Control": "private, max-age=1800" } });
}
