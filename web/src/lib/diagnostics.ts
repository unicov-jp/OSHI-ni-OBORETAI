import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// サーバーが使っている Supabase の鍵の種類と、特権の操作ができるかを確かめる(マスター向けの表示用)。
// 鍵の値そのものは返さない。種類(先頭の形)と、JWT形式なら role の名前だけを返す。
export async function serverKeyCheck(userId: string): Promise<{ kind: string; ok: boolean; detail: string }> {
  const fromSecret = process.env.SUPABASE_SECRET_KEY;
  const key = fromSecret ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const source = fromSecret ? "SUPABASE_SECRET_KEY" : "SUPABASE_SERVICE_ROLE_KEY";
  if (!key) return { kind: "未設定", ok: false, detail: "SUPABASE_SECRET_KEY が設定されていません" };

  let kind = "不明な形式";
  if (key.trim() !== key) kind = "前後に空白や改行が入っています";
  else if (key.startsWith("sb_secret_")) kind = "秘密の鍵(sb_secret_…)";
  else if (key.startsWith("sb_publishable_")) kind = "公開用の鍵(sb_publishable_…)。秘密の鍵に替えてください";
  else if (key.startsWith("eyJ")) {
    try {
      const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8")) as { role?: string };
      kind = payload.role === "service_role" ? "旧形式の service_role キー" : `旧形式のキー(role: ${payload.role ?? "不明"})。service_role の鍵に替えてください`;
    } catch {
      kind = "旧形式のキー(読み取れません)";
    }
  }

  // 特権(service_role)だけが実行できる関数を呼んで、実際に権限があるかを確かめる
  try {
    const { error } = await createAdminClient().rpc("oshikatsu_plan_of", { uid: userId });
    if (error) return { kind: `${source}: ${kind}`, ok: false, detail: `${error.code ?? ""} ${error.message ?? ""}`.trim().slice(0, 160) };
    return { kind: `${source}: ${kind}`, ok: true, detail: "特権の操作ができます" };
  } catch (error) {
    return { kind: `${source}: ${kind}`, ok: false, detail: (error instanceof Error ? error.message : "確認できませんでした").slice(0, 160) };
  }
}
