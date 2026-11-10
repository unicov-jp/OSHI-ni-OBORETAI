import type { Plan } from "@/lib/types";

// プランの表示名の既定(管理画面の「料金」で変えられる。変えた名前は getPlanLabels で読む)
export const PLAN_LABEL: Record<Plan, string> = { master: "Developer", paid: "有料", free: "無料" };
export type PlanLabels = Record<Plan, string>;

// 件数と上限の表示。上限なし(マスター)は「上限なし」と出す。
export function limitText(count: number, max: number | null, unit: string): string {
  return max === null ? `${count}${unit}(上限なし)` : `${count} / ${max}${unit}`;
}

export function atLimit(count: number, max: number | null): boolean {
  return max !== null && count >= max;
}

// 決済状況(Stripe の契約の状態)の表示。マスターは決済の対象外
export function billingLabel(plan: Plan, status: string | null | undefined): { text: string; tone: "ok" | "warn" | "danger" | "neutral" } {
  if (plan === "master") return { text: "対象外", tone: "neutral" };
  switch (status) {
    case "active":
      return { text: "支払い済み", tone: "ok" };
    case "trialing":
      return { text: "お試し中", tone: "ok" };
    case "past_due":
      return { text: "支払い遅れ", tone: "warn" };
    case "unpaid":
      return { text: "未払い", tone: "danger" };
    case "incomplete":
    case "incomplete_expired":
      return { text: "手続き中", tone: "warn" };
    case "canceled":
      return { text: "解約済み", tone: "neutral" };
    case "paused":
      return { text: "一時停止", tone: "warn" };
    default:
      return { text: "未契約", tone: "neutral" };
  }
}
