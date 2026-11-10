"use server";

import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { getTimeline } from "@/lib/data";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, Platform, TimelineItem } from "@/lib/types";

// 推しの id は今のアプリの記録(oshikatsu_records)の id。uuid とは限らない。
const oshiId = z.string().trim().min(1).max(100);

// 推しの登録・編集・削除は今のアプリ(推し活手帳)で行う。新しいアプリでは P3 で移す。

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
