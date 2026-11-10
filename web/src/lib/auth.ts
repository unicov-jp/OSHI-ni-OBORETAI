import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { demoViewer } from "@/lib/demo";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/types";

// ログイン中の利用者を返す。未ログインならログイン画面へ、停止中なら案内画面へ送る。
// 1リクエスト内では結果を使い回す。
export const requireViewer = cache(async (): Promise<Viewer> => {
  if (DEMO) return demoViewer;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: aal }, { data: factors }] = await Promise.all([
    supabase.from("profiles").select("email, display_name, role, suspended_at").eq("id", user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  if (!profile) redirect("/login?error=profile");
  if (profile.suspended_at) redirect("/suspended");

  const hasMfa = (factors?.totp ?? []).some((factor) => factor.status === "verified");
  const aal2 = aal?.currentLevel === "aal2";
  if (hasMfa && !aal2) redirect("/auth/mfa");

  const { data: planRows } = await supabase.rpc("my_plan");
  const plan = (planRows?.[0] ?? null) as {
    plan: "free" | "pro";
    max_oshi: number;
    max_sources: number;
    oshi_count: number;
    source_count: number;
  } | null;

  return {
    id: user.id,
    email: profile.email as string,
    displayName: (profile.display_name as string) || "",
    role: profile.role as "user" | "admin",
    plan: plan?.plan ?? "free",
    maxOshi: plan?.max_oshi ?? 3,
    maxSources: plan?.max_sources ?? 15,
    oshiCount: plan?.oshi_count ?? 0,
    sourceCount: plan?.source_count ?? 0,
    hasMfa,
    aal2,
    isDemo: false,
  };
});

// 運営者のみ通す。運営者は二段階認証が必須。
export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.role !== "admin") redirect("/app");
  if (!viewer.aal2) redirect("/app/settings?notice=admin-mfa");
  return viewer;
}
