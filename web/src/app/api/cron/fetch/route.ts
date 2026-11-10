import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDueFeeds } from "@/lib/fetchers/run";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// 定期取得。Vercel Cron(または外部のスケジューラ)から CRON_SECRET 付きで呼ばれる。
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const started = Date.now();
  const totals = { claimed: 0, ok: 0, failed: 0, added: 0 };

  // 1回の実行で時間の許す限り処理する(上限45秒)
  while (Date.now() - started < 45_000) {
    const result = await runDueFeeds(admin, 30);
    totals.claimed += result.claimed;
    totals.ok += result.ok;
    totals.failed += result.failed;
    totals.added += result.added;
    if (result.claimed < 30) break;
  }

  // 新着は期間では消さず、取得元ごとに新しい順で ITEM_KEEP_PER_FEED 件(既定500件)まで残す。
  // ITEM_RETENTION_DAYS を入れたときだけ、それより古いものも消す(既定は期間の制限なし)
  const retention = Number(process.env.ITEM_RETENTION_DAYS ?? 0);
  const keep = Number(process.env.ITEM_KEEP_PER_FEED ?? 500);
  await admin.rpc("oshikatsu_cleanup_old_data", {
    retention_days: Number.isFinite(retention) ? retention : 0,
    keep_per_feed: Number.isFinite(keep) ? keep : 500,
  });

  return NextResponse.json({ ...totals, ms: Date.now() - started });
}
