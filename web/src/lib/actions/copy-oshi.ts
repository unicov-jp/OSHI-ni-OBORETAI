"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { driveAccessToken, uploadPhotoToDrive } from "@/lib/google-drive";
import { canUseAdvanced } from "@/lib/plans";
import { ADVANCED_PLATFORMS } from "@/lib/platforms";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult, Plan } from "@/lib/types";

// 運営者向け: ある利用者の推し(プロフィール・個人とグループのSNS・アイコン・新着の取得先)を、別の利用者へ複製する。
// コピー元は変えない。コピー先に同じ名前の推しがいれば、その推しは複製しない。
// アイコンは、コピー元の Google ドライブから読み、コピー先の Google ドライブへ保存し直す
// (コピー先がドライブに接続していなければ、小さい画像はアプリの記録の中に入れる)。

const schema = z.object({
  fromEmail: z.string().trim().email().max(200),
  toEmail: z.string().trim().email().max(200),
  names: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
});

type Row = { id: string; data: Record<string, unknown> };
type CopyResult = { name: string; status: "copied" | "skipped" | "not_found"; note?: string };

const MAX_INLINE = 700 * 1024;
const normalize = (value: string) => value.replace(/[\s　]+/g, "").toLowerCase();

async function userByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const { data } = await admin.from("oshikatsu_profiles").select("user_id, plan").ilike("email", email).limit(2);
  const rows = (data ?? []) as { user_id: string; plan: Plan }[];
  return rows.length === 1 ? rows[0] : null;
}

// コピー元のドライブの写真を読み、コピー先へ保存し直した置き場所を返す
async function copyPhoto(
  admin: ReturnType<typeof createAdminClient>,
  fromId: string,
  toId: string,
  photo: unknown,
  name: string,
): Promise<{ photo: string | null; note?: string }> {
  if (typeof photo !== "string" || !photo) return { photo: null };
  if (photo.startsWith("data:image/")) return { photo };
  const fileId = /^gdrive:([A-Za-z0-9_-]{10,200})$/.exec(photo)?.[1];
  if (!fileId) return { photo: null, note: "アイコンの形式が分からないため、アイコンは複製しませんでした" };
  const fromToken = await driveAccessToken(admin, fromId);
  if (!fromToken) return { photo: null, note: "コピー元の Google ドライブに接続できず、アイコンは複製しませんでした" };
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${fromToken}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!response.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) {
    return { photo: null, note: "コピー元のアイコンを読めず、アイコンは複製しませんでした" };
  }
  const bytes = await response.arrayBuffer();
  const toToken = await driveAccessToken(admin, toId);
  if (toToken) {
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type === "image/gif" ? "gif" : "jpg";
    const ref = await uploadPhotoToDrive(toToken, toId, "その他", `oshi_${name}_${Date.now()}.${ext}`, bytes, type);
    return { photo: ref };
  }
  if (bytes.byteLength <= MAX_INLINE) {
    return { photo: `data:${type};base64,${Buffer.from(bytes).toString("base64")}`, note: "コピー先が Google ドライブに未接続のため、アイコンはアプリの記録の中に保存しました" };
  }
  return { photo: null, note: "コピー先が Google ドライブに未接続で、アイコンが大きいため複製しませんでした" };
}

export async function copyOshiBetweenUsers(input: z.input<typeof schema>): Promise<ActionResult<{ results: CopyResult[] }>> {
  const viewer = await requireAdmin();
  if (DEMO) return { ok: false, error: "デモ表示では使えません" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "メールアドレスと推しの名前を確認してください" };
  const { fromEmail, toEmail, names } = parsed.data;
  if (fromEmail.toLowerCase() === toEmail.toLowerCase()) return { ok: false, error: "コピー元とコピー先が同じです" };

  const admin = createAdminClient();
  const [from, to] = await Promise.all([userByEmail(admin, fromEmail), userByEmail(admin, toEmail)]);
  if (!from) return { ok: false, error: "コピー元の利用者が見つかりません" };
  if (!to) return { ok: false, error: "コピー先の利用者が見つかりません" };
  const advanced = canUseAdvanced(to.plan);

  const [{ data: fromRows }, { data: toRows }] = await Promise.all([
    admin.from("oshikatsu_records").select("id, data").eq("user_id", from.user_id).eq("kind", "oshi").eq("deleted", false),
    admin.from("oshikatsu_records").select("id, data").eq("user_id", to.user_id).eq("kind", "oshi").eq("deleted", false),
  ]);
  const sources = (fromRows ?? []) as Row[];
  const existing = new Set(((toRows ?? []) as Row[]).map((r) => normalize(String(r.data.name ?? ""))));
  let order = (toRows ?? []).length;

  const results: CopyResult[] = [];
  for (const name of names) {
    const key = normalize(name);
    const row = sources.find((r) => normalize(String(r.data.name ?? "")) === key) ?? sources.find((r) => normalize(String(r.data.name ?? "")).includes(key));
    if (!row) {
      results.push({ name, status: "not_found", note: "コピー元に見つかりませんでした" });
      continue;
    }
    const fullName = String(row.data.name ?? name);
    if (existing.has(normalize(fullName))) {
      results.push({ name: fullName, status: "skipped", note: "コピー先に同じ名前の推しがいます" });
      continue;
    }

    const notes: string[] = [];
    const id = crypto.randomUUID();
    const photo = await copyPhoto(admin, from.user_id, to.user_id, row.data.photo, fullName).catch(() => ({
      photo: null,
      note: "アイコンの複製に失敗しました",
    }));
    if (photo.note) notes.push(photo.note);
    const data: Record<string, unknown> = {
      ...row.data,
      id,
      photo: photo.photo,
      photoOriginal: null,
      order,
      _order: order,
      createdAt: Date.now(),
    };
    // コピー先が Sensitive を使えないプランなら、Sensitive の印と Fantia などの登録は外す
    if (!advanced) {
      if (data.sensitive === true) notes.push("コピー先のプランでは Sensitive を使えないため、通常の推しとして複製しました");
      data.sensitive = false;
    }
    const { error } = await admin.from("oshikatsu_records").insert({ user_id: to.user_id, kind: "oshi", id, data, deleted: false });
    if (error) {
      results.push({ name: fullName, status: "skipped", note: "保存に失敗しました" });
      continue;
    }
    order++;
    existing.add(normalize(fullName));

    // 新着の取得先(YouTube・Blog・X など)も複製する
    const { data: srcSources } = await admin
      .from("oshikatsu_sources")
      .select("platform, mode, url, handle, label, feed_id")
      .eq("user_id", from.user_id)
      .eq("oshi_id", row.id);
    const copies = ((srcSources ?? []) as { platform: string }[])
      .filter((s) => advanced || !ADVANCED_PLATFORMS.includes(s.platform as never))
      .map((s) => ({ ...s, user_id: to.user_id, oshi_id: id }));
    const dropped = (srcSources ?? []).length - copies.length;
    if (dropped > 0) notes.push(`コピー先のプランでは使えない SNS(${dropped}件)は複製しませんでした`);
    if (copies.length > 0) {
      await admin.from("oshikatsu_sources").upsert(copies, { onConflict: "user_id,oshi_id,url", ignoreDuplicates: true });
    }
    results.push({ name: fullName, status: "copied", note: notes.join(" / ") || undefined });
  }

  await admin.from("oshikatsu_audit_logs").insert({
    admin_id: viewer.id,
    action: "oshi.copy",
    target: to.user_id,
    detail: `from=${from.user_id} copied=${results.filter((r) => r.status === "copied").map((r) => r.name).join(",")}`.slice(0, 1000),
  });
  return { ok: true, data: { results } };
}
