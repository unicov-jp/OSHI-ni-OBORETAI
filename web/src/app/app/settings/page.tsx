import type { Metadata } from "next";
import Link from "next/link";
import { MfaPanel } from "@/components/mfa-panel";
import { Badge, buttonClass, Notice, Section } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { limitText, PLAN_LABEL } from "@/lib/plans";

export const metadata: Metadata = { title: "設定" };

const NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  upgraded: { tone: "ok", text: "お申し込みありがとうございます。反映まで数十秒かかることがあります。" },
  "admin-mfa": { tone: "warn", text: "管理画面を開くには、二段階認証の設定が必要です。" },
};

// サブスクの申し込み先(Stripe の申し込みページ)。Vercel の環境変数 STRIPE_SUBSCRIBE_URL に入れる。未設定なら「準備中」
function subscribeUrl(): string | null {
  const url = process.env.STRIPE_SUBSCRIBE_URL ?? "";
  return /^https:\/\/(buy\.stripe\.com|checkout\.stripe\.com|billing\.stripe\.com)\//.test(url) ? url : null;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const [{ notice }, viewer] = await Promise.all([searchParams, requireViewer()]);
  const banner = notice ? NOTICES[notice] : undefined;
  const subscribe = subscribeUrl();

  return (
    <div className="mx-auto max-w-[760px] space-y-5">
      <div>
        <Link href="/app" className="text-[13px] text-muted hover:text-text">
          ← 新着に戻る
        </Link>
        <h1 className="text-xl leading-7 font-bold">設定</h1>
      </div>
      {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}

      <Section title="アカウント">
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
        <form action="/auth/signout" method="post" className="mt-4 border-t border-line pt-4">
          <button type="submit" className={buttonClass("secondary")}>
            ログアウト
          </button>
        </form>
      </Section>

      <Section title="プラン">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={viewer.plan === "master" ? "warn" : viewer.plan === "paid" ? "brand" : "neutral"}>
              {PLAN_LABEL[viewer.plan]}
            </Badge>
            <p className="num text-sm text-muted">
              推し {limitText(viewer.oshiCount, viewer.maxOshi, "人")}、アカウント {limitText(viewer.sourceCount, viewer.maxSources, "件")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {viewer.plan === "master" ? null : subscribe ? (
              <a href={subscribe} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
                {viewer.plan === "paid" ? "サブスクの管理(Stripe)" : "サブスクに申し込む(Stripe)"}
              </a>
            ) : (
              <span className={`${buttonClass("primary")} pointer-events-none opacity-50`}>サブスクは準備中です</span>
            )}
            <Link href="/pricing" className={buttonClass("secondary")}>
              料金ページ
            </Link>
          </div>
        </div>
      </Section>
    </div>
  );
}
