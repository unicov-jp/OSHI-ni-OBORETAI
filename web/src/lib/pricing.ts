import "server-only";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Subscription の料金(推しの人数ごと)。管理画面の「料金」で変える。
// 表(oshikatsu_price_tiers)がまだ無い・読めないときは空(料金ページは「準備中」と出す)

export type PriceTier = { max_oshi: number; monthly_yen: number };

// 無料プランで登録できる推しの人数(これを超えたら Subscription)
export const FREE_OSHI = 3;

export async function getPriceTiers(): Promise<PriceTier[]> {
  if (DEMO) {
    return [
      { max_oshi: 10, monthly_yen: 300 },
      { max_oshi: 30, monthly_yen: 500 },
      { max_oshi: 50, monthly_yen: 800 },
    ];
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("oshikatsu_price_tiers").select("max_oshi, monthly_yen").order("max_oshi");
    if (error) return [];
    return (data ?? []) as PriceTier[];
  } catch {
    return [];
  }
}

export function yen(value: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(value)}円`;
}
