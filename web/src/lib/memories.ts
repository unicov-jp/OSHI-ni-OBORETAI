import "server-only";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEntry, GalleryPhoto } from "@/lib/types";

// 今のアプリ(推し活手帳)の記録から、推しのギャラリーとカレンダーを作る。
// - ギャラリー: 推しの記録の gallery(新しい順)と、その推しのチェキの写真(日付の新しい順)
// - カレンダー: その推しの LIVE・チェキの記録(物販は扱わない)
// 写真は /api/photo から本人だけが読める(Googleドライブの写真はサーバーで取りに行く)

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

// 記録に紐づく推し(先頭の oshiId と、対バンなどで足した extraOshis)
export function recordHasOshi(data: Raw, oshiId: string): boolean {
  if (data.oshiId === oshiId) return true;
  const extra = Array.isArray(data.extraOshis) ? data.extraOshis : [];
  return extra.some((e) => e && typeof e === "object" && (e as Raw).oshiId === oshiId);
}

// チェキの写真(以前の1枚だけの記録は photo のみ)
export function recordPhotos(data: Raw): string[] {
  const list = Array.isArray(data.photos) ? data.photos.filter((p): p is string => typeof p === "string" && p !== "") : [];
  if (list.length > 0) return list;
  return typeof data.photo === "string" && data.photo ? [data.photo] : [];
}

// 写真の版(写真が差し替わったらURLが変わるように)
function version(ref: string): string {
  let h = 2166136261;
  for (let i = 0; i < ref.length; i += Math.max(1, Math.floor(ref.length / 400))) {
    h ^= ref.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + ref.length.toString(36);
}

export function photoUrl(kind: string, id: string, field: string, index: number, ref: string): string {
  const q = new URLSearchParams({ k: kind, id, f: field, i: String(index), v: version(ref) });
  return `/api/photo?${q.toString()}`;
}

export async function getGallery(oshiId: string): Promise<GalleryPhoto[]> {
  if (DEMO) return [];
  const supabase = await createClient();
  const [{ data: oshiRow }, { data: chekiRows }] = await Promise.all([
    supabase.from("oshikatsu_records").select("data").eq("kind", "oshi").eq("id", oshiId).eq("deleted", false).maybeSingle(),
    supabase.from("oshikatsu_records").select("id, data").eq("kind", "cheki").eq("deleted", false),
  ]);
  const photos: GalleryPhoto[] = [];
  const gallery = Array.isArray((oshiRow?.data as Raw | null)?.gallery) ? ((oshiRow!.data as Raw).gallery as unknown[]) : [];
  gallery.forEach((ref, i) => {
    if (typeof ref !== "string" || !ref) return;
    photos.push({ key: `g-${i}-${version(ref)}`, src: photoUrl("oshi", oshiId, "gallery", i, ref), kind: "gallery", title: "", date: "" });
  });
  const cheki = (chekiRows ?? [])
    .map((row) => ({ id: row.id as string, data: (row.data ?? {}) as Raw }))
    .filter((row) => recordHasOshi(row.data, oshiId) && row.data.hidden !== true)
    .sort((a, b) => (str(a.data.date) < str(b.data.date) ? 1 : str(a.data.date) > str(b.data.date) ? -1 : 0));
  for (const row of cheki) {
    recordPhotos(row.data).forEach((ref, i) => {
      const field = Array.isArray(row.data.photos) && row.data.photos.length > 0 ? "photos" : "photo";
      photos.push({
        key: `c-${row.id}-${i}`,
        src: photoUrl("cheki", row.id, field, i, ref),
        kind: "cheki",
        title: str(row.data.title),
        date: str(row.data.date),
      });
    });
  }
  return photos;
}

export async function getCalendar(oshiId: string): Promise<CalendarEntry[]> {
  if (DEMO) return [];
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("oshikatsu_records")
    .select("kind, id, data")
    .in("kind", ["live", "cheki"])
    .eq("deleted", false);
  const entries: CalendarEntry[] = [];
  for (const row of rows ?? []) {
    const data = (row.data ?? {}) as Raw;
    const date = str(data.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !recordHasOshi(data, oshiId)) continue;
    const type = row.kind as CalendarEntry["type"];
    if (type === "live") {
      const time = str(data.startTime);
      entries.push({ id: row.id, type, date, title: str(data.title) || "LIVE", sub: [time ? `${time}〜` : "", str(data.venue)].filter(Boolean).join(" ") });
    } else {
      const count = Math.max(Number(data.count) || 1, recordPhotos(data).length, 1);
      entries.push({ id: row.id, type, date, title: str(data.title) || "チェキ", sub: `${count}枚` });
    }
  }
  return entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
