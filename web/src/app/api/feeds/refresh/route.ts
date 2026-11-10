import { NextResponse } from "next/server";
import { DEMO } from "@/lib/env";
import { runUserFeeds } from "@/lib/fetchers/run";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 1時間に押せる回数(外部サイトへの取得を伴うため)
const LIMIT_PER_HOUR = 6;

// 手動の「更新」ボタン。ログイン中の利用者が登録した YouTube・Blog の新着を、その場で取りに行く。
// 定期の取得は毎日18:00(日本時間)に /api/cron/fetch が行う。
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ error: "デモ表示では更新できません" }, { status: 400 });

  // 他のサイトから呼ばれないよう、同じサイトからの要求だけを受け付ける
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });

  // 停止中・二段階認証が済んでいないセッションは使えない(DB側の判定を使う)
  const { data: sessionOk } = await supabase.rpc("oshikatsu_session_ok");
  if (sessionOk !== true) return NextResponse.json({ error: "この操作はできません" }, { status: 403 });

  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("oshikatsu_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("action", "feeds.refresh")
    .gte("created_at", since);
  if ((count ?? 0) >= LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: `更新は1時間に${LIMIT_PER_HOUR}回までです。しばらくおいてからお試しください。` },
      { status: 429 },
    );
  }
  await admin.from("oshikatsu_rate_events").insert({ user_id: user.id, action: "feeds.refresh" });

  try {
    const result = await runUserFeeds(admin, user.id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "更新できませんでした。時間をおいてもう一度お試しください。" }, { status: 500 });
  }
}
