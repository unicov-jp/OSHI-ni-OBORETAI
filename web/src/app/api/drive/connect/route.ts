import { NextResponse } from "next/server";
import { DEMO } from "@/lib/env";
import { driveConfigured } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Googleドライブに接続する: Google の許可の画面へ移る。
// 許可されると /api/drive/callback に戻り、リフレッシュトークンを本人の行として保存する(今のアプリと同じ表)。
// 権限は drive.file(このアプリが作ったファイル・フォルダだけを扱える)。
// 不正な呼び戻しを防ぐため、毎回ランダムな値(state)を作り、本人のブラウザの Cookie にだけ置いて照らし合わせる。
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  if (DEMO || !driveConfigured()) return NextResponse.redirect(`${origin}/app/settings?notice=drive-unavailable`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: `${origin}/api/drive/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    // 毎回リフレッシュトークンを受け取るため、同意の画面を必ず出す
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    ...(user.email ? { login_hint: user.email } : {}),
  });
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  response.cookies.set("drive_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/drive",
    maxAge: 600,
  });
  return response;
}
