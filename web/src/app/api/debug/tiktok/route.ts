import { NextResponse } from "next/server";
import { tiktokProbe } from "@/lib/fetchers/tiktok";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// マスター向け: TikTok の動画をサーバーから読み取れるかを確かめる(例: /api/debug/tiktok?id=kyun_yoruami)
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  const { data: profile } = await supabase.from("oshikatsu_profiles").select("plan").eq("user_id", user.id).maybeSingle();
  if (profile?.plan !== "master") return NextResponse.json({ error: "マスターだけが使えます" }, { status: 403 });
  const id = (new URL(request.url).searchParams.get("id") ?? "").replace(/^@/, "");
  return NextResponse.json(await tiktokProbe(id), { headers: { "Cache-Control": "no-store" } });
}
