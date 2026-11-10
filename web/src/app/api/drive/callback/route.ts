import { cookies } from "next/headers";
import { siteUrl } from "@/lib/env";
import { NextResponse } from "next/server";
import { driveConfigured, forgetDriveToken } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Googleの許可の画面からの戻り先。認可コードをリフレッシュトークンに換え、本人の行として保存する。
// 戻り先は設定画面に固定(URLで行き先を指定させない)。
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const done = (notice: string) => {
    const response = NextResponse.redirect(`${origin}/app/settings?notice=${notice}`);
    response.cookies.set("drive_oauth_state", "", { path: "/api/drive", maxAge: 0 });
    return response;
  };
  if (!driveConfigured()) return done("drive-unavailable");

  // state の照らし合わせ(本人のブラウザから始めた接続か)
  const store = await cookies();
  const expected = store.get("drive_oauth_state")?.value ?? "";
  const state = searchParams.get("state") ?? "";
  if (!expected || state !== expected) return done("drive-failed");
  // 許可されなかった(キャンセルした)とき
  if (searchParams.get("error")) return done("drive-cancelled");
  const code = searchParams.get("code");
  if (!code) return done("drive-failed");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const exchange = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: driveCallbackUrl(origin),
      grant_type: "authorization_code",
    }).toString(),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  }).catch(() => null);
  const body = (exchange ? await exchange.json().catch(() => ({})) : {}) as { refresh_token?: string; scope?: string };
  if (!exchange?.ok) return done("drive-failed");
  // ドライブの権限のチェックを外して許可されたとき
  if (body.scope && !body.scope.includes("drive.file")) return done("drive-noscope");

  if (body.refresh_token) {
    const { error } = await supabase
      .from("oshikatsu_gdrive_tokens")
      .upsert({ user_id: user.id, refresh_token: body.refresh_token, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) return done("drive-failed");
  } else {
    // リフレッシュトークンが来なかった(すでに許可済み)ときは、保存済みのものがあれば接続済みとみなす
    const { data } = await supabase.from("oshikatsu_gdrive_tokens").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!data) return done("drive-failed");
  }
  forgetDriveToken(user.id);
  return done("drive-connected");
}

// Google に登録した戻り先URIとそろえる: サイトのURL(NEXT_PUBLIC_SITE_URL)が決まっていればそれ、無ければ開いているURL
function driveCallbackUrl(origin: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ? siteUrl() : origin;
  return `${base}/api/drive/callback`;
}
