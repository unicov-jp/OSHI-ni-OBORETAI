"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { getTimeline } from "@/lib/data";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { editableFrom, mergeIntoRecord, SNS_KEYS, type OshiEditable, type SnsKey } from "@/lib/oshi-record";
import { canUseAdvanced } from "@/lib/plans";
import type { ActionResult, Platform, TimelineItem } from "@/lib/types";

// 推しの id は今のアプリの記録(oshikatsu_records)の id。uuid とは限らない。
const oshiId = z.string().trim().min(1).max(100);

// 推しの登録・編集・削除。今のアプリ(推し活手帳)と同じ oshikatsu_records の行を読み書きするので、
// どちらのアプリで登録・編集しても、同期でもう一方に反映される。

// SNSの欄(SNS_KEYS と同じ並び)。足した欄が保存時に落ちないよう、SNS_KEYS から作る
const sns = z.object(Object.fromEntries(SNS_KEYS.map((key) => [key, z.string().max(300).default("")])) as Record<SnsKey, z.ZodDefault<z.ZodString>>);
const editSchema = z.object({
  id: oshiId.optional(),
  name: z.string().trim().min(1, "名前を入力してください").max(40, "名前は40文字までです"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "色の指定が正しくありません"),
  agency: z.string().max(40, "事務所は40文字までです"),
  birthMonth: z.string().regex(/^(|[1-9]|1[0-2])$/),
  birthDay: z.string().regex(/^(|[1-9]|[12][0-9]|3[01])$/),
  birthYear: z.string().regex(/^(|19[0-9]{2}|20[0-9]{2})$/),
  person: sns,
  groups: z.array(z.object({ id: z.string().max(100).optional(), name: z.string().max(40, "グループ名は40文字までです"), sns })).max(10),
  sensitive: z.boolean().default(false),
});

// 編集画面に出す値(写真やギャラリーなど、ここで触らない項目は返さない)
export async function getOshiForEdit(id: string): Promise<ActionResult<OshiEditable>> {
  if (DEMO) return { ok: false, error: "デモ表示では編集できません" };
  await requireViewer();
  if (!oshiId.safeParse(id).success) return { ok: false, error: "対象が正しくありません" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("oshikatsu_records")
    .select("data")
    .eq("kind", "oshi")
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();
  if (!data) return { ok: false, error: "推しが見つかりません" };
  return { ok: true, data: editableFrom(id, (data.data ?? {}) as Record<string, unknown>) };
}

export async function saveOshiRecord(input: OshiEditable): Promise<ActionResult<{ id: string }>> {
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  const viewer = await requireViewer();
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  const value = parsed.data as OshiEditable;

  const supabase = await createClient();
  const { data: rows, error: listError } = await supabase
    .from("oshikatsu_records")
    .select("id, data")
    .eq("kind", "oshi")
    .eq("deleted", false);
  if (listError) return { ok: false, error: "読み込めませんでした。時間をおいてもう一度お試しください。" };

  let current: Record<string, unknown> | null = null;
  if (value.id) {
    const row = (rows ?? []).find((r) => r.id === value.id);
    if (!row) return { ok: false, error: "推しが見つかりません" };
    current = (row.data ?? {}) as Record<string, unknown>;
  } else if (viewer.maxOshi !== null && (rows ?? []).length >= viewer.maxOshi) {
    return { ok: false, error: `登録できる推しは${viewer.maxOshi}人までです。` };
  }

  // Sensitive の登録・解除は Sensitive プラン(と Developer)だけ。それ以外のプランでは今の値のまま
  if (!canUseAdvanced(viewer.plan)) value.sensitive = current?.sensitive === true;

  const id = value.id ?? crypto.randomUUID();
  const order = (rows ?? []).length;
  const data = mergeIntoRecord(current, value, { id, order });
  const { error } = await supabase
    .from("oshikatsu_records")
    .upsert({ user_id: viewer.id, kind: "oshi", id, data, deleted: false }, { onConflict: "user_id,kind,id" });
  if (error) return { ok: false, error: "保存できませんでした。時間をおいてもう一度お試しください。" };
  revalidatePath("/app", "layout");
  return { ok: true, data: { id } };
}

// 削除: 今のアプリと同じく「削除の印」を付ける(中身は残るので、今のアプリの「削除された記録を探す」から戻せる)
export async function deleteOshiRecord(id: string): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  await requireViewer();
  if (!oshiId.safeParse(id).success) return { ok: false, error: "対象が正しくありません" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("oshikatsu_records")
    .update({ deleted: true })
    .eq("kind", "oshi")
    .eq("id", id);
  if (error) return { ok: false, error: "削除できませんでした。時間をおいてもう一度お試しください。" };
  // この推しに登録した新着の取得先も外す
  await supabase.from("oshikatsu_sources").delete().eq("oshi_id", id);
  revalidatePath("/app", "layout");
  return { ok: true };
}

// タブを開いたことを記録する(未読件数の基準時刻を進める)。
export async function markSeen(oshiIds: string[]): Promise<ActionResult> {
  if (DEMO) return { ok: true };
  const viewer = await requireViewer();
  const ids = z.array(oshiId).max(100).safeParse(oshiIds);
  if (!ids.success || ids.data.length === 0) return { ok: true };

  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase
    .from("oshikatsu_feed_seen")
    .upsert(
      ids.data.map((id) => ({ user_id: viewer.id, oshi_id: id, last_seen_at: now })),
      { onConflict: "user_id,oshi_id" },
    );
  return { ok: true };
}

export async function loadMore(input: {
  oshiIds: string[];
  platform?: Platform;
  before: string;
}): Promise<ActionResult<TimelineItem[]>> {
  await requireViewer();
  const schema = z.object({
    oshiIds: z.array(oshiId).max(100),
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

// 推しのアイコンの写真を外す(今のアプリと同じく photo・photoOriginal を空にする。ドライブのファイルは消さない)
export async function removeOshiPhoto(id: string): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: "デモ表示では変更できません" };
  await requireViewer();
  if (!oshiId.safeParse(id).success) return { ok: false, error: "対象が正しくありません" };
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("oshikatsu_records")
    .select("data")
    .eq("kind", "oshi")
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();
  if (!row) return { ok: false, error: "推しが見つかりません" };
  const { error } = await supabase
    .from("oshikatsu_records")
    .update({ data: { ...(row.data as Record<string, unknown>), photo: null, photoOriginal: null } })
    .eq("kind", "oshi")
    .eq("id", id);
  if (error) return { ok: false, error: "保存できませんでした。時間をおいてもう一度お試しください。" };
  revalidatePath("/app", "layout");
  return { ok: true };
}
