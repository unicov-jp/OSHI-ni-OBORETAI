"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { runFeed, type FeedRow } from "@/lib/fetchers/run";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

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
  const { error } = await supabase.rpc("admin_set_suspended", { target: userId, suspended });
  if (error) return failure(error.message);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setRole(userId: string, role: "user" | "admin"): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  await requireAdmin();
  if (!uuid.safeParse(userId).success) return { ok: false, error: "対象が正しくありません" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_role", { target: userId, new_role: role });
  if (error) return failure(error.message);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setFeedStatus(feedId: string, status: "active" | "paused"): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  await requireAdmin();
  if (!uuid.safeParse(feedId).success) return { ok: false, error: "対象が正しくありません" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_feed_status", { target: feedId, new_status: status });
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
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (isAdmin !== true) return { ok: false, error: "運営者の権限がありません" };

  const admin = createAdminClient();
  const { data: feed } = await admin
    .from("feeds")
    .select("id, platform, external_key, feed_url, title, error_count")
    .eq("id", feedId)
    .maybeSingle();
  if (!feed) return { ok: false, error: "取得元が見つかりません" };

  const result = await runFeed(admin, { ...(feed as FeedRow), error_count: 0 });
  await admin.from("audit_logs").insert({
    admin_id: viewer.id,
    action: "feed.refetch",
    target: feedId,
    detail: result.ok ? `added ${result.added}` : (result.error ?? ""),
  });
  revalidatePath("/admin", "layout");
  if (!result.ok) return { ok: false, error: `取得に失敗しました: ${result.error}` };
  return { ok: true, data: { added: result.added } };
}
