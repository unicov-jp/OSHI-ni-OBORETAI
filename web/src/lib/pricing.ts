import "server-only";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Subscription の料金: 無料の人数(3人)を超えた推し1人ごとに、月額を加算する。
// 1人あたりの金額は管理画面の「料金」で変える(oshikatsu_price_settings)。未設定・読めないときは null(料金ページは「準備中」)

// 無料プランで登録できる推しの人数
export const FREE_OSHI = 3;
// Subscription で登録できる推しの上限(DBの oshikatsu_max_oshi と同じ)
export const PAID_MAX_OSHI = 50;

export async function getPerOshiPrice(): Promise<number | null> {
  if (DEMO) return 100;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("oshikatsu_price_settings").select("per_oshi_yen").maybeSingle();
    if (error || !data) return null;
    return data.per_oshi_yen as number;
  } catch {
    return null;
  }
}

// 推し count 人のときの月額
export function monthlyFor(count: number, perOshi: number): number {
  return Math.max(0, count - FREE_OSHI) * perOshi;
}

export function yen(value: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(value)}円`;
}
