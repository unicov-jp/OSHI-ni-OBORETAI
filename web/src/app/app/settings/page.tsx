import type { Metadata } from "next";
import Link from "next/link";
import { MfaPanel } from "@/components/mfa-panel";
import { Badge, buttonClass, Notice, Section } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { PLAN_LABEL } from "@/lib/plans";

export const metadata: Metadata = { title: "設定" };

// adminOnly: マスターにだけ出すお知らせ
const NOTICES: Record<string, { tone: "ok" | "warn"; text: string; adminOnly?: boolean }> = {
  upgraded: { tone: "ok", text: "お申し込みありがとうございます。反映まで数十秒かかることがあります。" },
  "admin-mfa": { tone: "warn", text: "管理画面を開くには、二段階認証の設定が必要です。", adminOnly: true },
};

// Stripe ボタンの行き先。Vercel の環境変数 STRIPE_SUBSCRIBE_URL に入れる(Stripe のページのみ)。未設定なら押せない表示にする
function stripeUrl(): string | null {
  const url = process.env.STRIPE_SUBSCRIBE_URL ?? "";
  return /^https:\/\/(buy\.stripe\.com|checkout\.stripe\.com|billing\.stripe\.com)\//.test(url) ? url : null;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const [{ notice }, viewer] = await Promise.all([searchParams, requireViewer()]);
  const found = notice ? NOTICES[notice] : undefined;
  const banner = found && (!found.adminOnly || viewer.role === "admin") ? found : undefined;
  const stripe = stripeUrl();

  return (
    <div className="mx-auto max-w-[760px] space-y-5 pb-8">
      <div>
        <Link href="/app" className="text-[13px] text-muted hover:text-text">
          ← TOP
        </Link>
        <h1 className="text-xl leading-7 font-bold">設定</h1>
      </div>
      {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}

      <Section title="Account">
        <dl className="mb-4 grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 text-sm">
          <dt className="text-muted">ログイン</dt>
          <dd>Google</dd>
          <dt className="text-muted">メール</dt>
          <dd className="clamp-1" title={viewer.email}>
            {viewer.email}
          </dd>
        </dl>
        <div className="border-t border-line pt-4">
          <MfaPanel enabled={viewer.hasMfa} isAdmin={viewer.role === "admin"} />
        </div>
      </Section>

      <Section title="Subscription">
        <div className="space-y-4">
          <Badge tone={viewer.plan === "master" ? "warn" : viewer.plan === "paid" ? "brand" : "neutral"}>
            {PLAN_LABEL[viewer.plan]}
          </Badge>
          <div className="flex flex-wrap gap-2">
            {stripe ? (
              <a href={stripe} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
                Stripe
              </a>
            ) : (
              <span className={`${buttonClass("primary")} pointer-events-none opacity-50`} aria-disabled="true">
                Stripe
              </span>
            )}
            <Link href="/pricing" className={buttonClass("secondary")}>
              料金ページ
            </Link>
          </div>
        </div>
      </Section>

      {/* ログアウトは画面のいちばん下に、赤で出す */}
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="h-11 w-full rounded-xl bg-[#e5484d] text-sm font-bold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          ログアウト
        </button>
      </form>
    </div>
  );
}
