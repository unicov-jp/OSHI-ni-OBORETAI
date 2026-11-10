import "server-only";
import { DEMO } from "@/lib/env";
import { PLAN_LABEL, type PlanLabels } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";

// プランの表示名(管理画面の「料金」で決めたもの。未設定・読めないときは既定の名前)
export async function getPlanLabels(): Promise<PlanLabels> {
  const labels: PlanLabels = { ...PLAN_LABEL };
  if (DEMO) return labels;
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("oshikatsu_plan_names").select("plan, label");
    for (const row of data ?? []) {
      const plan = row.plan as keyof PlanLabels;
      if (plan in labels && typeof row.label === "string" && row.label.trim()) labels[plan] = row.label.trim();
    }
  } catch {
    // 表がまだ無いときは既定の名前
  }
  return labels;
}
