import { NextResponse } from "next/server";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// X・Instagram・TikTok の未読の投稿(推しごとの投稿の番号)。
// 投稿は定期取得(Supabase の定期実行から15分ごと)と、推しを開いたときの取得で記録してあるものを使う。
// SNS を登録した後に見つけた投稿のうち、直近30日でまだ表示していないもの
export async function GET() {
  if (DEMO) return NextResponse.json({ keys: {} });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "login" }, { status: 401 });

  const { data, error } = await supabase.rpc("oshikatsu_social_unread_keys");
  if (error) return NextResponse.json({ keys: {} });
  const keys: Record<string, string[]> = {};
  for (const row of (data ?? []) as { oshi_id: string; post_key: string }[]) (keys[row.oshi_id] ??= []).push(row.post_key);
  return NextResponse.json({ keys }, { headers: { "Cache-Control": "private, no-store" } });
}
