import type { Plan } from "@/lib/types";

// プランの表示名(今のアプリと同じ3種類)
export const PLAN_LABEL: Record<Plan, string> = { master: "マスター", paid: "有料", free: "無料" };

// 件数と上限の表示。上限なし(マスター)は「上限なし」と出す。
export function limitText(count: number, max: number | null, unit: string): string {
  return max === null ? `${count}${unit}(上限なし)` : `${count} / ${max}${unit}`;
}

export function atLimit(count: number, max: number | null): boolean {
  return max !== null && count >= max;
}
