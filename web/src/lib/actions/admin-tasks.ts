"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// 運営者向け管理画面の「残作業」の追加・完了・編集・削除(運営者だけ。DB側でも運営者だけに絞っている)

export type AdminTask = { id: string; title: string; detail: string; done: boolean; created_at: string; done_at: string | null };

const id = z.string().uuid();
const fields = z.object({
  title: z.string().trim().min(1, "内容を入力してください").max(120, "見出しは120文字までです"),
  detail: z.string().trim().max(2000, "詳しい内容は2000文字までです").default(""),
});

export async function getAdminTasks(): Promise<AdminTask[]> {
  await requireAdmin();
  if (DEMO) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("oshikatsu_admin_tasks")
    .select("id, title, detail, done, created_at, done_at")
    .order("done", { ascending: true })
    .order("created_at", { ascending: true });
  return (data ?? []) as AdminTask[];
}

export async function addAdminTask(input: z.input<typeof fields>): Promise<ActionResult> {
  await requireAdmin();
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  const parsed = fields.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  const supabase = await createClient();
  const { error } = await supabase.from("oshikatsu_admin_tasks").insert(parsed.data);
  if (error) return { ok: false, error: "追加できませんでした" };
  revalidatePath("/admin/tasks");
  return { ok: true };
}

export async function updateAdminTask(taskId: string, input: z.input<typeof fields>): Promise<ActionResult> {
  await requireAdmin();
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  const parsedId = id.safeParse(taskId);
  const parsed = fields.safeParse(input);
  if (!parsedId.success || !parsed.success) return { ok: false, error: parsed.success ? "保存できませんでした" : (parsed.error.issues[0]?.message ?? "入力内容を確認してください") };
  const supabase = await createClient();
  const { error } = await supabase.from("oshikatsu_admin_tasks").update(parsed.data).eq("id", parsedId.data);
  if (error) return { ok: false, error: "保存できませんでした" };
  revalidatePath("/admin/tasks");
  return { ok: true };
}

export async function setAdminTaskDone(taskId: string, done: boolean): Promise<ActionResult> {
  await requireAdmin();
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  const parsedId = id.safeParse(taskId);
  if (!parsedId.success) return { ok: false, error: "変更できませんでした" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("oshikatsu_admin_tasks")
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq("id", parsedId.data);
  if (error) return { ok: false, error: "変更できませんでした" };
  revalidatePath("/admin/tasks");
  return { ok: true };
}

export async function deleteAdminTask(taskId: string): Promise<ActionResult> {
  await requireAdmin();
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  const parsedId = id.safeParse(taskId);
  if (!parsedId.success) return { ok: false, error: "削除できませんでした" };
  const supabase = await createClient();
  const { error } = await supabase.from("oshikatsu_admin_tasks").delete().eq("id", parsedId.data);
  if (error) return { ok: false, error: "削除できませんでした" };
  revalidatePath("/admin/tasks");
  return { ok: true };
}
