import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { driveAccessToken, uploadPhotoToDrive } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
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
  const value = (row?.data as Raw | null)?.[field];
  const ref = Array.isArray(value) ? value[index] : index === 0 ? value : undefined;
  if (typeof ref !== "string") return new NextResponse(null, { status: 404 });

  // 端末に保存していた頃の写真(data:image/...;base64,...)
  const inline = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(ref);
  if (inline) {
    const bytes = Buffer.from(inline[2], "base64");
    if (bytes.byteLength > MAX_BYTES) return new NextResponse(null, { status: 413 });
    return image(bytes, inline[1]);
  }

  // Google ドライブに保存した写真(gdrive:<ファイルID>)
  const fileId = /^gdrive:([A-Za-z0-9_-]{10,200})$/.exec(ref)?.[1];
  if (!fileId) return new NextResponse(null, { status: 404 });
  const token = await driveAccessToken(supabase, user.id);
  if (!token) return new NextResponse(null, { status: 404 });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!response.ok || !IMAGE_TYPES.includes(type)) return new NextResponse(null, { status: 404 });
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return new NextResponse(null, { status: 413 });
  return image(bytes, type);
}

// 写真を追加する(multipart/form-data)
// - target=gallery: 推しのギャラリーの先頭に入れる(今のアプリのギャラリーと同じ)
// - target=cheki: チェキの記録を1件作る(title=イベント名、date=日付、写真は1件にまとめる)
export async function POST(request: Request) {
  if (DEMO) return NextResponse.json({ error: "デモ表示では追加できません" }, { status: 400 });
  const viewer = await requireViewer();
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "送信内容を読めませんでした" }, { status: 400 });

  const target = form.get("target");
  const oshiId = String(form.get("oshiId") ?? "");
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  if (target !== "gallery" && target !== "cheki") return NextResponse.json({ error: "追加先が正しくありません" }, { status: 400 });
  if (!oshiId || oshiId.length > 100) return NextResponse.json({ error: "推しが正しくありません" }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "写真を選んでください" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `一度に追加できるのは${MAX_FILES}枚までです` }, { status: 400 });
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type)) return NextResponse.json({ error: "画像ファイルを選んでください" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "写真が大きすぎます" }, { status: 400 });
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
        const name = target === "gallery" ? `gallery_${oshiId}_${stamp}_${i}.jpg` : `cheki_${recordId}_${stamp}_${i + 1}.jpg`;
        refs.push(await uploadPhotoToDrive(token, viewer.id, target === "gallery" ? "Gallery" : "チェキ", name, bytes, file.type));
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

  if (target === "gallery") {
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

