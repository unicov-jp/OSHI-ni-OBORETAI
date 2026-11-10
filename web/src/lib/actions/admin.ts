"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { runFeed, type FeedRow } from "@/lib/fetchers/run";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Plan } from "@/lib/types";

const DEMO_ERROR = "デモ表示では変更できません";
const uuid = z.string().uuid();

function failure(message: string): ActionResult {
  if (message.includes("SELF_CHANGE")) return { ok: false, error: "自分自身は変更できません" };
  if (message.includes("FORBIDDEN")) return { ok: false, error: "運営者の権限がありません" };
  return { ok: false, error: "変更できませんでした。時間をおいてもう一度お試しください。" };
}

// 以下の変更はDB側の関数が運営者権限(二段階認証済み)を再確認し、操作ログを残す。

export async function setSuspended(userId: string, suspended: boolean): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  await requireAdmin();
  if (!uuid.safeParse(userId).success) return { ok: false, error: "対象が正しくありません" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("oshikatsu_admin_set_suspended", { target: userId, suspended });
  if (error) return failure(error.message);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

// プラン(マスター・有料・無料)を変える。マスターは運営者を兼ねる。
export async function setPlan(userId: string, plan: Plan): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  await requireAdmin();
  if (!uuid.safeParse(userId).success) return { ok: false, error: "対象が正しくありません" };
  if (!["master", "paid", "free"].includes(plan)) return { ok: false, error: "プランが正しくありません" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("oshikatsu_admin_set_plan", { target: userId, new_plan: plan });
  if (error) return failure(error.message);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setFeedStatus(feedId: string, status: "active" | "paused"): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  await requireAdmin();
  if (!uuid.safeParse(feedId).success) return { ok: false, error: "対象が正しくありません" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("oshikatsu_admin_set_feed_status", { target: feedId, new_status: status });
  if (error) return failure(error.message);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function refetchFeed(feedId: string): Promise<ActionResult<{ added: number }>> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  const viewer = await requireAdmin();
  if (!uuid.safeParse(feedId).success) return { ok: false, error: "対象が正しくありません" };

  // 運営者権限をDB側でも確認する(画面側の判定だけに頼らない)
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("oshikatsu_is_admin");
  if (isAdmin !== true) return { ok: false, error: "運営者の権限がありません" };

  const admin = createAdminClient();
  const { data: feed } = await admin
    .from("oshikatsu_feeds")
    .select("id, platform, external_key, feed_url, title, error_count")
    .eq("id", feedId)
    .maybeSingle();
  if (!feed) return { ok: false, error: "取得元が見つかりません" };

  const result = await runFeed(admin, { ...(feed as FeedRow), error_count: 0 });
  await admin.from("oshikatsu_audit_logs").insert({
    admin_id: viewer.id,
    action: "feed.refetch",
    target: feedId,
    detail: result.ok ? `added ${result.added}` : (result.error ?? ""),
  });
  revalidatePath("/admin", "layout");
  if (!result.ok) return { ok: false, error: `取得に失敗しました: ${result.error}` };
  return { ok: true, data: { added: result.added } };
}

// Subscription の料金(推しの人数ごと)をまとめて置き換える
const tierSchema = z
  .array(z.object({ max_oshi: z.number().int().min(4).max(1000), monthly_yen: z.number().int().min(0).max(1000000) }))
  .max(10, "料金は10段階までです");

export async function setPriceTiers(input: { max_oshi: number; monthly_yen: number }[]): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  await requireAdmin();
  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "人数は4〜1000人、金額は0〜1,000,000円で入力してください" };
  const tiers = [...parsed.data].sort((a, b) => a.max_oshi - b.max_oshi);
  if (new Set(tiers.map((t) => t.max_oshi)).size !== tiers.length) return { ok: false, error: "同じ人数が2つあります" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("oshikatsu_admin_set_price_tiers", { tiers });
  if (error) {
    if (error.message.includes("oshikatsu_admin_set_price_tiers")) {
      return { ok: false, error: "料金の表がまだありません。新着用のSQLを実行してください" };
    }
    return failure(error.message);
  }
  revalidatePath("/pricing");
  revalidatePath("/admin", "layout");
  return { ok: true };
}
