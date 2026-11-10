import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { driveAccessToken, forgetDriveToken, uploadPhotoToDrive } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 3 * 1024 * 1024;
// 表示するときは、端末から撮ったままの大きな写真も返せるようにする
const MAX_SHOW_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// 写真を返せなかった理由(画面には出さず、サーバーの記録と応答の見出しに残す)
function missing(status: number, reason: string) {
  console.warn(`[photo] ${status} ${reason}`);
  return new NextResponse(null, { status, headers: { "X-Photo-Error": reason, "Cache-Control": "no-store" } });
}

async function fetchDrive(token: string, fileId: string) {
  return await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
}
// ドライブに接続していないときは、今のアプリと同じく画像データのまま記録に入れる(今のアプリが後でドライブへ移す)
const MAX_INLINE_BYTES = 600 * 1024;
const MAX_FILES = 10;

type Raw = Record<string, unknown>;

function image(bytes: ArrayBuffer | Buffer, type: string) {
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": type,
      // URLに写真の版(?v=)が付くので、同じURLの間は長く使い回してよい。本人だけが見るので private
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// 記録の写真を1枚返す。本人の記録だけを読む(行レベルセキュリティ)。
// ?k=oshi|cheki|live|goods &id=記録のid &f=photo|photos|gallery &i=何枚目
export async function GET(request: Request) {
  if (DEMO) return new NextResponse(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  const kind = params.get("k") ?? "";
  const id = params.get("id") ?? "";
  const field = params.get("f") ?? "";
  const index = Number(params.get("i") ?? "0");
  if (!["oshi", "cheki", "live", "goods"].includes(kind) || !["photo", "photos", "gallery"].includes(field)) {
    return new NextResponse(null, { status: 400 });
  }
  if (!id || id.length > 100 || !Number.isInteger(index) || index < 0 || index > 1000) {
    return new NextResponse(null, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { data: row } = await supabase
    .from("oshikatsu_records")
    .select("data")
    .eq("kind", kind)
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();
  if (!row) return missing(404, "record-not-found");
  const value = (row.data as Raw | null)?.[field];
  const ref = Array.isArray(value) ? value[index] : index === 0 ? value : undefined;
  if (typeof ref !== "string" || !ref) return missing(404, "no-photo");

  // 端末に保存していた頃の写真(data:image/...;base64,...)
  const inline = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(ref.trim());
  if (inline) {
    const bytes = Buffer.from(inline[2].replace(/\s/g, ""), "base64");
    if (bytes.byteLength > MAX_SHOW_BYTES) return missing(413, "inline-too-large");
    return image(bytes, inline[1].toLowerCase());
  }

  // Google ドライブに保存した写真(gdrive:<ファイルID>)
  const fileId = /^gdrive:([A-Za-z0-9_-]{10,200})$/.exec(ref.trim())?.[1];
  if (!fileId) return missing(404, "unknown-ref");
  let token = await driveAccessToken(supabase, user.id);
  if (!token) return missing(404, "drive-not-connected");
  let response = await fetchDrive(token, fileId).catch(() => null);
  // トークンが使えなかったときは取り直して、もう1回だけ試す。通信の失敗も1回だけやり直す
  if (!response || response.status === 401 || response.status >= 500) {
    if (response?.status === 401) forgetDriveToken(user.id);
    token = await driveAccessToken(supabase, user.id);
    if (!token) return missing(404, "drive-not-connected");
    response = await fetchDrive(token, fileId).catch(() => null);
  }
  if (!response) return missing(504, "drive-timeout");
  if (!response.ok) return missing(response.status === 404 ? 404 : 502, `drive-${response.status}`);
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith("image/") || type === "image/svg+xml") return missing(415, `drive-type-${type || "none"}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_SHOW_BYTES) return missing(413, "drive-too-large");
  return image(bytes, type);
}

// 写真を追加する(multipart/form-data)
// - target=gallery: 推しのギャラリーの先頭に入れる(今のアプリのギャラリーと同じ)
// - target=cheki: チェキの記録を1件作る(title=イベント名、date=日付、写真は1件にまとめる)
// - target=live: LIVEの記録(recordId)のポスターを差し替える(写真の1枚目。1枚だけ)
// - target=oshi-photo: 推しのアイコンの写真を差し替える(photos=[切り抜いた写真, 元の写真]。今のアプリの photo・photoOriginal)
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ error: "デモ表示では追加できません" }, { status: 400 });
  const viewer = await requireViewer();
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "送信内容を読めませんでした" }, { status: 400 });

  const target = form.get("target");
  const oshiId = String(form.get("oshiId") ?? "");
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  if (target !== "gallery" && target !== "cheki" && target !== "live" && target !== "oshi-photo") return NextResponse.json({ error: "追加先が正しくありません" }, { status: 400 });
  if (!oshiId || oshiId.length > 100) return NextResponse.json({ error: "推しが正しくありません" }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "写真を選んでください" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `一度に追加できるのは${MAX_FILES}枚までです` }, { status: 400 });
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type)) return NextResponse.json({ error: "画像ファイルを選んでください" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "写真が大きすぎます" }, { status: 400 });
  }
  if (target === "oshi-photo" && files.length !== 2) return NextResponse.json({ error: "写真を選び直してください" }, { status: 400 });
  const liveId = String(form.get("recordId") ?? "");
  if (target === "live" && (!liveId || liveId.length > 100 || files.length !== 1)) {
    return NextResponse.json({ error: "ポスターは1枚選んでください" }, { status: 400 });
  }
  const title = String(form.get("title") ?? "").trim().slice(0, 60);
  const date = String(form.get("date") ?? "");
  if (target === "cheki") {
    if (!title) return NextResponse.json({ error: "イベント名を入力してください" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "日付を入力してください" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: oshiRow } = await supabase
    .from("oshikatsu_records")
    .select("data")
    .eq("kind", "oshi")
    .eq("id", oshiId)
    .eq("deleted", false)
    .maybeSingle();
  if (!oshiRow) return NextResponse.json({ error: "推しが見つかりません" }, { status: 404 });
  const oshiData = (oshiRow.data ?? {}) as Raw;

  // 写真の置き場所: ドライブに接続していればドライブ、していなければ画像データのまま
  const token = await driveAccessToken(supabase, viewer.id);
  const stamp = Date.now();
  const recordId = crypto.randomUUID();
  const refs: string[] = [];
  try {
    for (const [i, file] of files.entries()) {
      const bytes = await file.arrayBuffer();
      if (token) {
        const name =
          target === "gallery" ? `gallery_${oshiId}_${stamp}_${i}.jpg`
            : target === "live" ? `live_${liveId}_${stamp}_1.jpg`
              : target === "oshi-photo" ? `oshi_${oshiId}_${i === 0 ? "photo" : "original"}_${stamp}.jpg`
                : `cheki_${recordId}_${stamp}_${i + 1}.jpg`;
        const sub = target === "gallery" ? "Gallery" : target === "live" ? "LIVE" : target === "oshi-photo" ? "その他" : "チェキ";
        refs.push(await uploadPhotoToDrive(token, viewer.id, sub, name, bytes, file.type));
      } else {
        if (bytes.byteLength > MAX_INLINE_BYTES) {
          return NextResponse.json({ error: "写真が大きすぎます。Googleドライブに接続すると保存できます" }, { status: 400 });
        }
        refs.push(`data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`);
      }
    }
  } catch {
    return NextResponse.json({ error: "写真を保存できませんでした。時間をおいてもう一度お試しください" }, { status: 502 });
  }

  if (target === "oshi-photo") {
    const { error } = await supabase
      .from("oshikatsu_records")
      .update({ data: { ...oshiData, photo: refs[0], photoOriginal: refs[1] } })
      .eq("kind", "oshi")
      .eq("id", oshiId);
    if (error) return NextResponse.json({ error: "保存できませんでした" }, { status: 500 });
  } else if (target === "live") {
    const { data: liveRow } = await supabase
      .from("oshikatsu_records")
      .select("data")
      .eq("kind", "live")
      .eq("id", liveId)
      .eq("deleted", false)
      .maybeSingle();
    if (!liveRow) return NextResponse.json({ error: "LIVEの記録が見つかりません" }, { status: 404 });
    const data = (liveRow.data ?? {}) as Raw;
    // 写真は photos に並び順で持ち、1枚目を photo にも入れる(今のアプリと同じ)
    const photos = Array.isArray(data.photos) ? data.photos.slice(1) : [];
    const { error } = await supabase
      .from("oshikatsu_records")
      .update({ data: { ...data, photos: [refs[0], ...photos], photo: refs[0] } })
      .eq("kind", "live")
      .eq("id", liveId);
    if (error) return NextResponse.json({ error: "保存できませんでした" }, { status: 500 });
  } else if (target === "gallery") {
    const current = Array.isArray(oshiData.gallery) ? oshiData.gallery : [];
    const { error } = await supabase
      .from("oshikatsu_records")
      .update({ data: { ...oshiData, gallery: [...refs, ...current] } })
      .eq("kind", "oshi")
      .eq("id", oshiId);
    if (error) return NextResponse.json({ error: "保存できませんでした" }, { status: 500 });
  } else {
    const groups = Array.isArray(oshiData.groups) ? (oshiData.groups as Raw[]) : [];
    const record: Raw = {
      id: recordId,
      date,
      title,
      count: refs.length,
      price: 0,
      content: "",
      memo: "",
      tag: "",
      photos: refs,
      oshiId,
      groupId: typeof groups[0]?.id === "string" ? groups[0].id : "",
      favorite: false,
      hidden: false,
      createdAt: stamp,
    };
    const { error } = await supabase
      .from("oshikatsu_records")
      .insert({ user_id: viewer.id, kind: "cheki", id: recordId, data: record, deleted: false });
    if (error) return NextResponse.json({ error: "保存できませんでした" }, { status: 500 });
  }
  revalidatePath("/app");
  return NextResponse.json({ ok: true, added: refs.length, drive: Boolean(token) });
}

