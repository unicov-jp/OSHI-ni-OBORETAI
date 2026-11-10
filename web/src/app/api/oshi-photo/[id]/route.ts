import { NextResponse } from "next/server";
import { DEMO } from "@/lib/env";
import { driveAccessToken } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

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

// 今のアプリで推しに設定した写真を返す。本人の推しの写真だけを返す(行レベルセキュリティ)。
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (DEMO) return new NextResponse(null, { status: 404 });
  const { id } = await params;
  if (!id || id.length > 100) return new NextResponse(null, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { data: row } = await supabase
    .from("oshikatsu_records")
    .select("data")
    .eq("kind", "oshi")
    .eq("id", id)
    .eq("deleted", false)
    .maybeSingle();
  const photo = (row?.data as { photo?: unknown } | null)?.photo;
  if (typeof photo !== "string") return new NextResponse(null, { status: 404 });

  // 端末に保存していた頃の写真(data:image/...;base64,...)
  const inline = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(photo);
  if (inline) {
    const bytes = Buffer.from(inline[2], "base64");
    if (bytes.byteLength > MAX_BYTES) return new NextResponse(null, { status: 413 });
    return image(bytes, inline[1]);
  }

  // Google ドライブに保存した写真(gdrive:<ファイルID>)
  const fileId = /^gdrive:([A-Za-z0-9_-]{10,200})$/.exec(photo)?.[1];
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
