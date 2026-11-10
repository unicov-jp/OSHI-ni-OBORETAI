import type { Metadata } from "next";
import { PlanNameEditor } from "@/components/plan-name-editor";
import { PriceEditor } from "@/components/price-editor";
import { getPlanLabels } from "@/lib/plan-names";
import { FREE_OSHI, getPrices, PAID_MAX_OSHI } from "@/lib/pricing";

export const metadata: Metadata = { title: "料金" };

// Subscription の料金: 無料の人数を超えた推し1人ごとに加算する月額を決める。保存すると料金ページにすぐ反映される
export default async function AdminPricingPage() {
  const [prices, labels] = await Promise.all([getPrices(), getPlanLabels()]);
  return (
    <div className="max-w-[640px] space-y-4">
      <h1 className="text-xl leading-7 font-bold">料金</h1>
      <p className="text-sm text-muted">
        推し{FREE_OSHI}人までは無料です。それを超えた推し1人ごとに、ここで決めた金額を月額に加算します(最大{PAID_MAX_OSHI}人)。{labels.advanced} は Fantia・myfans・xfans・FANZA も登録できるプランです。保存すると料金ページにすぐ反映されます。
      </p>
      <PriceEditor
        initial={prices.paid}
        initialAdvanced={prices.advanced}
        freeOshi={FREE_OSHI}
        maxOshi={PAID_MAX_OSHI}
        paidName={labels.paid}
        advancedName={labels.advanced}
      />
      <p className="text-xs text-muted">Stripe 側の金額は、Stripe の連携を作るときにこの金額とつなぎます。</p>

      <h2 className="pt-4 text-lg font-bold">プラン名</h2>
      <p className="text-sm text-muted">設定画面・料金ページ・管理画面に出るプランの名前です。</p>
      <PlanNameEditor initial={labels} />
    </div>
  );
}
