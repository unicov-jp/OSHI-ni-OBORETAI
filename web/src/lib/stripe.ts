import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

let cached: Stripe | null = null;

export function stripe(): Stripe {
  cached ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return cached;
}

export function billingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

// 表示用の料金。金額はコードに書かず、Stripe に登録された料金をそのまま表示する。
export async function proPriceLabel(): Promise<string | null> {
  if (!billingEnabled()) return null;
  try {
    const price = await stripe().prices.retrieve(requireEnv("STRIPE_PRICE_ID"));
    if (price.unit_amount === null) return null;
    const zeroDecimal = ["jpy", "krw", "vnd"].includes(price.currency);
    const amount = new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: price.currency.toUpperCase(),
    }).format(zeroDecimal ? price.unit_amount : price.unit_amount / 100);
    const interval = price.recurring?.interval === "year" ? "年" : "月";
    return `${amount} / ${interval}`;
  } catch {
    return null;
  }
}

// Stripe 側の最新状態を取り直してDBへ反映する。
// Webhook は順不同・重複で届くため、届いたイベントの中身ではなく最新の状態を正とする。
export async function syncSubscription(admin: SupabaseClient, subscriptionId: string): Promise<void> {
  const subscription = await stripe().subscriptions.retrieve(subscriptionId);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  let userId: string | null = subscription.metadata?.user_id ?? null;
  if (!userId) {
    const { data } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = (data?.user_id as string | undefined) ?? null;
  }
  if (!userId) throw new Error(`利用者を特定できない契約です: ${subscriptionId}`);

  const item = subscription.items.data[0];
  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      price_id: item?.price.id ?? null,
      current_period_end: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`契約状態を保存できませんでした: ${error.message}`);
}
