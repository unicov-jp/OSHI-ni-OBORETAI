import "server-only";
import { DEMO } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Subscription の料金: 無料の人数(3人)を超えた推し1人ごとに、月額を加算する。
// 1人あたりの金額は管理画面の「料金」で変える(oshikatsu_price_settings)。未設定・読めないときは null(料金ページは「準備中」)

// 無料プランで登録できる推しの人数
export const FREE_OSHI = 3;
// Subscription で登録できる推しの上限(DBの oshikatsu_max_oshi と同じ)
export const PAID_MAX_OSHI = 50;

// Advanced プランの推し1人あたりの月額の既定(管理画面で変えるまで)
export const ADVANCED_PER_OSHI_DEFAULT = 100;

// 推し1人あたりの月額。paid=有料(未設定なら null)、advanced=Advanced
export async function getPrices(): Promise<{ paid: number | null; advanced: number }> {
  if (DEMO) return { paid: 50, advanced: ADVANCED_PER_OSHI_DEFAULT };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("oshikatsu_price_settings").select("*").maybeSingle();
    if (error || !data) return { paid: null, advanced: ADVANCED_PER_OSHI_DEFAULT };
    const advanced = typeof data.advanced_per_oshi_yen === "number" ? data.advanced_per_oshi_yen : ADVANCED_PER_OSHI_DEFAULT;
    return { paid: data.per_oshi_yen as number, advanced };
  } catch {
    return { paid: null, advanced: ADVANCED_PER_OSHI_DEFAULT };
  }
}

// 推し count 人のときの月額
export function monthlyFor(count: number, perOshi: number): number {
  return Math.max(0, count - FREE_OSHI) * perOshi;
}

export function yen(value: number): string {
  return `${new Intl.NumberFormat("ja-JP").format(value)}円`;
}
