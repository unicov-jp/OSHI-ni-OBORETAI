import type { Metadata } from "next";
import Link from "next/link";
import { MfaPanel } from "@/components/mfa-panel";
import { BillingButtons, DisplayNameForm } from "@/components/settings-forms";
import { ThemeSwitch } from "@/components/theme-switch";
import { Badge, buttonClass, formatDateTime, Notice, Section } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { billingEnabled, proPriceLabel } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "設定" };

const NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  upgraded: { tone: "ok", text: "お申し込みありがとうございます。反映まで数十秒かかることがあります。" },
  "admin-mfa": { tone: "warn", text: "管理画面を開くには、二段階認証の設定が必要です。" },
};

async function subscriptionInfo(): Promise<{ periodEnd: string | null; cancelAtEnd: boolean }> {
  if (DEMO) return { periodEnd: new Date(Date.now() + 20 * 86400_000).toISOString(), cancelAtEnd: false };
  const supabase = await createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("current_period_end, cancel_at_period_end")
    .maybeSingle();
  return {
    periodEnd: (data?.current_period_end as string | null) ?? null,
    cancelAtEnd: Boolean(data?.cancel_at_period_end),
  };
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const [{ notice }, viewer] = await Promise.all([searchParams, requireViewer()]);
  const [price, subscription] = await Promise.all([DEMO ? null : proPriceLabel(), subscriptionInfo()]);
  const banner = notice ? NOTICES[notice] : undefined;
  const isPro = viewer.plan === "pro";

  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <h1 className="text-xl leading-7 font-bold">設定</h1>
      {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}

      <Section title="表示" description="背景の明るさを切り替えます。選んだ設定はこの端末に保存されます。">
        <ThemeSwitch />
      </Section>

      <Section title="アカウント">
        <dl className="mb-4 grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 text-sm">
          <dt className="text-muted">ログイン</dt>
          <dd>Google</dd>
          <dt className="text-muted">メール</dt>
          <dd className="clamp-1" title={viewer.email}>
            {viewer.email}
          </dd>
        </dl>
        <DisplayNameForm initial={viewer.displayName} />
        <form action="/auth/signout" method="post" className="mt-4 border-t border-line pt-4">
          <button type="submit" className={buttonClass("secondary")}>
            ログアウト
          </button>
        </form>
      </Section>

      <Section title="二段階認証">
        <MfaPanel enabled={viewer.hasMfa} isAdmin={viewer.role === "admin"} />
      </Section>

      <Section title="プラン">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={isPro ? "brand" : "neutral"}>{isPro ? "Pro" : "無料"}</Badge>
            <p className="num text-sm text-muted">
              推し {viewer.oshiCount} / {viewer.maxOshi}人、アカウント {viewer.sourceCount} / {viewer.maxSources}件
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="data-table text-sm">
              <thead>
                <tr>
                  <th className="w-[40%]">できること</th>
                  <th>無料</th>
                  <th>Pro{price ? `(${price})` : ""}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>登録できる推し</td>
                  <td className="num">3人</td>
                  <td className="num">50人</td>
                </tr>
                <tr>
                  <td>登録できるアカウント</td>
                  <td className="num">15件</td>
                  <td className="num">300件</td>
                </tr>
              </tbody>
            </table>
          </div>
          {isPro && subscription.periodEnd ? (
            <p className="text-sm text-muted">
              {subscription.cancelAtEnd ? "解約済みです。次の日時までProをご利用いただけます: " : "次回の更新日時: "}
              {formatDateTime(subscription.periodEnd)}
            </p>
          ) : null}
          <BillingButtons isPro={isPro} enabled={DEMO || billingEnabled()} />
          <p className="text-xs text-muted">
            お支払いはStripeの画面で行います。カード情報は当アプリには保存されません。
            <Link href="/legal/tokushoho" className="ml-1 underline">
              特定商取引法に基づく表記
            </Link>
          </p>
        </div>
      </Section>
    </div>
  );
}
