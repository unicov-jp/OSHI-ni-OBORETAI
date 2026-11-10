import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Googleログインの戻り先。認可コードをセッションに交換する。
// 戻り先は固定(/app)。URLで行き先を指定させない(不正な転送の防止)。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/app`);
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
