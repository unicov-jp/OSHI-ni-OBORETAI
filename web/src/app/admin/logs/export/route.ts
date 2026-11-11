import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 運営者向け: ログを CSV で書き出す(Excel で開けるよう UTF-8 の BOM を付ける)。
//   /admin/logs/export?tab=fetch&only=failed&days=7  … 取得ログ(失敗だけ・直近7日)
//   /admin/logs/export?tab=audit&days=30             … 操作ログ
// 1回に書き出すのは最大5000行

const MAX_ROWS = 5000;

function cell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  // 表計算ソフトで式として扱われないよう、先頭が = + - @ のときは ' を付ける
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

// 日本時間の「2026-11-11 16:58:12」
function jst(iso: string | null): string {
  if (!iso) return "";
  return new Date(Date.parse(iso) + 9 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
}

export async function GET(request: Request) {
  await requireAdmin();
  if (DEMO) return NextResponse.json({ error: "デモ表示では使えません" }, { status: 400 });
  const params = new URL(request.url).searchParams;
  const tab = params.get("tab") === "audit" ? "audit" : "fetch";
  const onlyFailed = params.get("only") === "failed";
  const days = Math.min(90, Math.max(1, Number.parseInt(params.get("days") ?? "7", 10) || 7));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const supabase = await createClient();
  const stamp = jst(new Date().toISOString()).replace(/[-: ]/g, "").slice(0, 12);

  let csv: string;
  let name: string;
  if (tab === "fetch") {
    let query = supabase
      .from("oshikatsu_fetch_logs")
      .select("id, ok, items_found, items_added, duration_ms, error, created_at, feed_id, oshikatsu_feeds(title, platform, feed_url, status, error_count)")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (onlyFailed) query = query.eq("ok", false);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "取得ログを読み込めませんでした" }, { status: 500 });
    const rows = (data ?? []).map((row) => {
      const raw = row.oshikatsu_feeds as Record<string, unknown> | Record<string, unknown>[] | null;
      const feed = (Array.isArray(raw) ? raw[0] : raw) ?? {};
      return [
        jst(row.created_at as string), feed.platform ?? "", feed.title ?? "", row.ok ? "成功" : "失敗",
        row.items_added, row.items_found, row.duration_ms, row.error ?? "",
        feed.feed_url ?? "", feed.status ?? "", feed.error_count ?? "", row.feed_id ?? "", row.id,
      ];
    });
    csv = toCsv(
      ["日時(日本時間)", "種類", "取得元", "結果", "新着", "件数", "所要時間(ms)", "エラー", "取得先URL", "取得元の状態", "連続失敗", "取得元ID", "ログID"],
      rows,
    );
    name = `fetch-logs${onlyFailed ? "-failed" : ""}-${days}d-${stamp}.csv`;
  } else {
    const { data, error } = await supabase
      .from("oshikatsu_audit_logs")
      .select("id, admin_id, action, target, detail, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS);
    if (error) return NextResponse.json({ error: "操作ログを読み込めませんでした" }, { status: 500 });
    const ids = [...new Set((data ?? []).map((r) => r.admin_id as string | null).filter(Boolean))] as string[];
    const emails = new Map<string, string>();
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from("oshikatsu_profiles").select("user_id, email").in("user_id", ids);
      for (const p of profiles ?? []) emails.set(p.user_id as string, (p.email as string | null) ?? "");
    }
    const rows = (data ?? []).map((row) => [
      jst(row.created_at as string), emails.get(row.admin_id as string) ?? "", row.action, row.target, row.detail, row.id,
    ]);
    csv = toCsv(["日時(日本時間)", "運営者", "操作", "対象", "内容", "ログID"], rows);
    name = `audit-logs-${days}d-${stamp}.csv`;
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
