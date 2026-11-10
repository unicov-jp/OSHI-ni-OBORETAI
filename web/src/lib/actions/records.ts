"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

// LIVE の記録を追加する。今のアプリ(推し活手帳)の LIVE の記録と同じ形で oshikatsu_records に入れるので、
// 今のアプリのカレンダー・一覧にも同期で反映される。
const liveSchema = z.object({
  oshiId: z.string().trim().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を入力してください"),
  title: z.string().trim().min(1, "イベント名を入力してください").max(60, "イベント名は60文字までです"),
  startTime: z.string().regex(/^(|\d{2}:\d{2})$/, "開始時刻が正しくありません"),
  venue: z.string().trim().max(60, "会場は60文字までです"),
  viewing: z.enum(["venue", "stream", "tbd"]),
  memo: z.string().max(500, "メモは500文字までです"),
});

export async function addLive(input: z.input<typeof liveSchema>): Promise<ActionResult<{ id: string }>> {
  if (DEMO) return { ok: false, error: "デモ表示では追加できません" };
  const viewer = await requireViewer();
  const parsed = liveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" };
  const value = parsed.data;

  const supabase = await createClient();
  const { data: oshiRow } = await supabase
    .from("oshikatsu_records")
    .select("data")
    .eq("kind", "oshi")
    .eq("id", value.oshiId)
    .eq("deleted", false)
    .maybeSingle();
  if (!oshiRow) return { ok: false, error: "推しが見つかりません" };
  const groups = Array.isArray((oshiRow.data as Record<string, unknown>)?.groups)
    ? ((oshiRow.data as Record<string, unknown>).groups as Record<string, unknown>[])
    : [];

  const id = crypto.randomUUID();
  const record = {
    id,
    date: value.date,
    title: value.title,
    viewing: value.viewing,
    openTime: "",
    startTime: value.startTime,
    endTime: "",
    venue: value.venue,
    price: 0,
    seat: "",
    ticketType: "",
    ticketUrl: "",
    memo: value.memo,
    tag: "",
    setlists: [],
    streamUrls: [],
    streamUrl: "",
    extraOshis: [],
    venuePlace: null,
    oshiId: value.oshiId,
    groupId: typeof groups[0]?.id === "string" ? groups[0].id : "",
    favorite: false,
    hidden: false,
    createdAt: Date.now(),
  };
  const { error } = await supabase
    .from("oshikatsu_records")
    .insert({ user_id: viewer.id, kind: "live", id, data: record, deleted: false });
  if (error) return { ok: false, error: "保存できませんでした。時間をおいてもう一度お試しください。" };
  revalidatePath("/app");
  return { ok: true, data: { id } };
}
