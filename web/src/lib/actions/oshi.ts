"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { getTimeline } from "@/lib/data";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, CategoryKind, Platform, TimelineItem } from "@/lib/types";

const DEMO_ERROR = "デモ表示では変更できません";

const oshiSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "名前を入力してください").max(40, "名前は40文字までです"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "色の指定が正しくありません"),
  note: z.string().trim().max(200, "メモは200文字までです"),
  group: z.string().trim().max(40, "グループ名は40文字までです"),
  agency: z.string().trim().max(40, "事務所名は40文字までです"),
  genre: z.string().trim().max(40, "ジャンル名は40文字までです"),
});

export type OshiInput = z.input<typeof oshiSchema>;

type Client = Awaited<ReturnType<typeof createClient>>;

// 分類は名前で指定する。同じ名前があればそれを使い、なければ作る。
async function categoryId(supabase: Client, kind: CategoryKind, name: string): Promise<string | null> {
  if (!name) return null;
  const { data: found } = await supabase
    .from("categories")
    .select("id")
    .eq("kind", kind)
    .eq("name", name)
    .maybeSingle();
  if (found) return found.id as string;
  const { data: created, error } = await supabase
    .from("categories")
    .insert({ kind, name })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

// どの推しからも使われなくなった分類を片付ける。
async function pruneCategories(supabase: Client) {
  const [{ data: categories }, { data: oshi }] = await Promise.all([
    supabase.from("categories").select("id"),
    supabase.from("oshi").select("group_id, agency_id, genre_id"),
  ]);
  const used = new Set<string>();
  for (const row of oshi ?? []) {
    for (const id of [row.group_id, row.agency_id, row.genre_id]) if (id) used.add(id as string);
  }
  const unused = (categories ?? []).map((c) => c.id as string).filter((id) => !used.has(id));
  if (unused.length > 0) await supabase.from("categories").delete().in("id", unused);
}

export async function saveOshi(input: OshiInput): Promise<ActionResult<{ id: string }>> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  const viewer = await requireViewer();

  const parsed = oshiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  const value = parsed.data;

  const supabase = await createClient();
  try {
    const row = {
      name: value.name,
      color: value.color,
      note: value.note,
      group_id: await categoryId(supabase, "group", value.group),
      agency_id: await categoryId(supabase, "agency", value.agency),
      genre_id: await categoryId(supabase, "genre", value.genre),
    };

    let id = value.id;
    if (id) {
      const { error } = await supabase.from("oshi").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase.from("oshi").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      id = data.id as string;
    }
    await pruneCategories(supabase);
    revalidatePath("/app", "layout");
    return { ok: true, data: { id: id! } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("OSHI_LIMIT")) {
      return {
        ok: false,
        error: `登録できる推しは${viewer.maxOshi}人までです。${viewer.plan === "free" ? "Proプランで50人まで登録できます。" : ""}`,
      };
    }
    return { ok: false, error: "保存できませんでした。時間をおいてもう一度お試しください。" };
  }
}

export async function deleteOshi(id: string): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: DEMO_ERROR };
  await requireViewer();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "対象が正しくありません" };

  const supabase = await createClient();
  const { error } = await supabase.from("oshi").delete().eq("id", id);
  if (error) return { ok: false, error: "削除できませんでした。時間をおいてもう一度お試しください。" };
  await pruneCategories(supabase);
  revalidatePath("/app", "layout");
  return { ok: true };
}

// タブを開いたことを記録する(未読件数の基準時刻を進める)。
export async function markSeen(oshiIds: string[]): Promise<ActionResult> {
  if (DEMO) return { ok: true };
  await requireViewer();
  const ids = z.array(z.string().uuid()).max(100).safeParse(oshiIds);
  if (!ids.success || ids.data.length === 0) return { ok: true };

  const supabase = await createClient();
  await supabase.from("oshi").update({ last_seen_at: new Date().toISOString() }).in("id", ids.data);
  return { ok: true };
}

export async function loadMore(input: {
  oshiIds: string[];
  platform?: Platform;
  before: string;
}): Promise<ActionResult<TimelineItem[]>> {
  await requireViewer();
  const schema = z.object({
    oshiIds: z.array(z.string().min(1)).max(100),
    platform: z.enum(["youtube", "blog"]).optional(),
    before: z.string().datetime({ offset: true }),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "読み込めませんでした" };
  try {
    return { ok: true, data: await getTimeline(parsed.data) };
  } catch {
    return { ok: false, error: "読み込めませんでした。時間をおいてもう一度お試しください。" };
  }
}
