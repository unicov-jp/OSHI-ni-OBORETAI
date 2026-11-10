"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { DEMO, requireEnv, siteUrl } from "@/lib/env";
import { billingEnabled, stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

async function customerFor(userId: string, email: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.stripe_customer_id) return data.stripe_customer_id as string;

  const customer = await stripe().customers.create({ email, metadata: { user_id: userId } });
  const { error } = await admin
    .from("subscriptions")
    .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  return customer.id;
}

// Proプランの申し込み画面(Stripe Checkout)へ進む。カード情報は当アプリを通らない。
export async function startCheckout(): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: "デモ表示では申し込めません" };
  const viewer = await requireViewer();
  if (!billingEnabled()) return { ok: false, error: "有料プランの申し込みは準備中です" };
  if (viewer.plan !== "free") return openPortal();

  let url: string | null = null;
  try {
    const customer = await customerFor(viewer.id, viewer.email);
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: viewer.id,
      line_items: [{ price: requireEnv("STRIPE_PRICE_ID"), quantity: 1 }],
      subscription_data: { metadata: { user_id: viewer.id } },
      success_url: `${siteUrl()}/app/settings?notice=upgraded`,
      cancel_url: `${siteUrl()}/app/settings`,
      locale: "ja",
    });
    url = session.url;
  } catch {
    return { ok: false, error: "申し込み画面を開けませんでした。時間をおいてもう一度お試しください。" };
  }
  if (!url) return { ok: false, error: "申し込み画面を開けませんでした。" };
  redirect(url);
}

// 支払い方法の変更・解約(Stripe カスタマーポータル)へ進む。
export async function openPortal(): Promise<ActionResult> {
  if (DEMO) return { ok: false, error: "デモ表示では開けません" };
  const viewer = await requireViewer();
  if (!billingEnabled()) return { ok: false, error: "現在、契約の管理画面は利用できません" };

  let url: string | null = null;
  try {
    const customer = await customerFor(viewer.id, viewer.email);
    const session = await stripe().billingPortal.sessions.create({
      customer,
      return_url: `${siteUrl()}/app/settings`,
    });
    url = session.url;
  } catch {
    return { ok: false, error: "契約の管理画面を開けませんでした。時間をおいてもう一度お試しください。" };
  }
  redirect(url);
}
