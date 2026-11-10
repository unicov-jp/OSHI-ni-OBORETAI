import { NextResponse } from "next/server";
import { DEMO } from "@/lib/env";
import { runOshiFeeds, runUserFeeds } from "@/lib/fetchers/run";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 1時間に押せる回数(外部サイトへの取得を伴うため)。推しを1人選んだときの更新は、取得元ごとに
// 10分は取り直さないので、回数の上限を大きめにする
const LIMIT_PER_HOUR = 6;
const OSHI_LIMIT_PER_HOUR = 120;

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

  // 推しを1人選んだときは、その推しの取得元だけ(本文の { oshiId })
  const body = (await request.json().catch(() => ({}))) as { oshiId?: unknown };
  const oshiId = typeof body.oshiId === "string" && body.oshiId.length > 0 && body.oshiId.length <= 100 ? body.oshiId : null;
  const action = oshiId ? "feeds.refresh.oshi" : "feeds.refresh";
  const limit = oshiId ? OSHI_LIMIT_PER_HOUR : LIMIT_PER_HOUR;

  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("oshikatsu_rate_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("action", action)
    .gte("created_at", since);
  if ((count ?? 0) >= limit) {
    return NextResponse.json(
      { error: `更新は1時間に${limit}回までです。しばらくおいてからお試しください。` },
      { status: 429 },
    );
  }
  await admin.from("oshikatsu_rate_events").insert({ user_id: user.id, action });

  try {
    const result = oshiId ? await runOshiFeeds(admin, user.id, oshiId) : await runUserFeeds(admin, user.id);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "更新できませんでした。時間をおいてもう一度お試しください。" }, { status: 500 });
  }
}
