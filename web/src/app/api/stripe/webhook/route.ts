import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, syncSubscription } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe からの通知を受け、契約状態をDBへ反映する。
// 署名を検証できない通知は処理しない(第三者がProを偽装できないようにするため)。
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return NextResponse.json({ error: "not configured" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subscriptionId) await syncSubscription(admin, subscriptionId);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncSubscription(admin, event.data.object.id);
        break;
      default:
        break;
    }
  } catch (error) {
    // 500 を返すと Stripe が再送する
    console.error("stripe webhook failed", event.type, error);
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
