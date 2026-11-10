import type { Metadata } from "next";
import { PriceTierEditor } from "@/components/price-tier-editor";
import { FREE_OSHI, getPriceTiers } from "@/lib/pricing";

export const metadata: Metadata = { title: "料金" };

// Subscription の料金(推しの人数ごと)を変える。保存すると料金ページにすぐ反映される
export default async function AdminPricingPage() {
  const tiers = await getPriceTiers();
  return (
    <div className="max-w-[640px] space-y-4">
      <h1 className="text-xl leading-7 font-bold">料金</h1>
      <p className="text-sm text-muted">
        Subscription の月額を、登録できる推しの人数ごとに決めます。無料は推し{FREE_OSHI}人までです。保存すると料金ページにすぐ反映されます。
      </p>
      <PriceTierEditor initial={tiers} freeOshi={FREE_OSHI} />
      <p className="text-xs text-muted">Stripe 側の金額は、Stripe の画面で同じ金額に合わせてください(自動ではそろいません)。</p>
    </div>
  );
}
