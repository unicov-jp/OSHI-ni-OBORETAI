import { NextResponse } from "next/server";
import { xProbe } from "@/lib/fetchers/x";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// マスター向け: X の投稿をサーバーから読み取れるかを確かめる(例: /api/debug/x?id=Yoruamiofficial)
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  const { data: profile } = await supabase.from("oshikatsu_profiles").select("plan").eq("user_id", user.id).maybeSingle();
  if (profile?.plan !== "master") return NextResponse.json({ error: "マスターだけが使えます" }, { status: 403 });
  const id = (new URL(request.url).searchParams.get("id") ?? "").replace(/^@/, "");
  return NextResponse.json(await xProbe(id), { headers: { "Cache-Control": "no-store" } });
}
