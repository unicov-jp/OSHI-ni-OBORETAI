import type { Metadata } from "next";
import { PriceEditor } from "@/components/price-editor";
import { FREE_OSHI, getPerOshiPrice, PAID_MAX_OSHI } from "@/lib/pricing";

export const metadata: Metadata = { title: "料金" };

// Subscription の料金: 無料の人数を超えた推し1人ごとに加算する月額を決める。保存すると料金ページにすぐ反映される
export default async function AdminPricingPage() {
  const perOshi = await getPerOshiPrice();
  return (
    <div className="max-w-[640px] space-y-4">
      <h1 className="text-xl leading-7 font-bold">料金</h1>
      <p className="text-sm text-muted">
        推し{FREE_OSHI}人までは無料です。それを超えた推し1人ごとに、ここで決めた金額を月額に加算します(最大{PAID_MAX_OSHI}人)。保存すると料金ページにすぐ反映されます。
      </p>
      <PriceEditor initial={perOshi} freeOshi={FREE_OSHI} maxOshi={PAID_MAX_OSHI} />
      <p className="text-xs text-muted">Stripe 側の金額は、Stripe の連携を作るときにこの金額とつなぎます。</p>
    </div>
  );
}
