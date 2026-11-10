import { NextResponse } from "next/server";
import { siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// マスター向け: Googleドライブの接続で Google に伝えている値を確かめる(/api/debug/drive)。
// 戻り先URLと、クライアントIDの先頭・末尾だけを返す(シークレットは返さない。有無だけ)
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  const { data: profile } = await supabase.from("oshikatsu_profiles").select("plan").eq("user_id", user.id).maybeSingle();
  if (profile?.plan !== "master") return NextResponse.json({ error: "マスターだけが使えます" }, { status: 403 });

  const { origin } = new URL(request.url);
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
  const base = process.env.NEXT_PUBLIC_SITE_URL ? siteUrl() : origin;
  return NextResponse.json(
    {
      redirect_uri: `${base}/api/drive/callback`,
      opened_origin: origin,
      site_url_env: process.env.NEXT_PUBLIC_SITE_URL ?? "(未設定)",
      client_id: clientId ? `${clientId.slice(0, 20)}…${clientId.slice(-30)}` : "(未設定)",
      client_id_has_spaces: clientId !== clientId.trim(),
      client_secret_set: Boolean(process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
