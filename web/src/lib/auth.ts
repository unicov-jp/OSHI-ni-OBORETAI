import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { demoViewer } from "@/lib/demo";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Plan, Viewer } from "@/lib/types";

// ログイン中の利用者を返す。未ログインならログイン画面へ、停止中なら案内画面へ送る。
// 利用者とプランは今のアプリと同じ oshikatsu_profiles を使う(運営者 = マスター)。
// 1リクエスト内では結果を使い回す。
export const requireViewer = cache(async (): Promise<Viewer> => {
  if (DEMO) return demoViewer;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: aal }, { data: factors }] = await Promise.all([
    supabase
      .from("oshikatsu_profiles")
      .select("email, display_name, plan, suspended_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  if (!profile) redirect("/login?error=profile");
  if (profile.suspended_at) redirect("/suspended");

  const hasMfa = (factors?.totp ?? []).some((factor) => factor.status === "verified");
  const aal2 = aal?.currentLevel === "aal2";
  if (hasMfa && !aal2) redirect("/auth/mfa");

  const { data: planRows } = await supabase.rpc("oshikatsu_my_plan");
  const row = (planRows?.[0] ?? null) as {
    plan: Plan;
    max_oshi: number | null;
    max_sources: number | null;
    oshi_count: number;
    source_count: number;
  } | null;
  const plan: Plan = row?.plan ?? ((profile.plan as Plan) || "free");

  return {
    id: user.id,
    email: (profile.email as string | null) ?? user.email ?? "",
    displayName: (profile.display_name as string) || "",
    role: plan === "master" ? "admin" : "user",
    plan,
    maxOshi: row ? row.max_oshi : 3,
    maxSources: row ? row.max_sources : 15,
    oshiCount: row?.oshi_count ?? 0,
    sourceCount: row?.source_count ?? 0,
    hasMfa,
    aal2,
    isDemo: false,
  };
});

// 運営者(マスター)のみ通す。運営者は二段階認証が必須。
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "admin") redirect("/app");
  if (!viewer.aal2) redirect("/app/settings?notice=admin-mfa");
  return viewer;
}

