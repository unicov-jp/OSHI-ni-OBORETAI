import type { Metadata } from "next";
import Link from "next/link";
import { DrivePanel } from "@/components/drive-panel";
import { MfaPanel } from "@/components/mfa-panel";
import { Notice, Section } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { DEMO } from "@/lib/env";
import { driveConfigured } from "@/lib/google-drive";
import { createClient } from "@/lib/supabase/server";
import { getPlanLabels } from "@/lib/plan-names";

export const metadata: Metadata = { title: "設定" };

// adminOnly: マスターにだけ出すお知らせ
const NOTICES: Record<string, { tone: "ok" | "warn"; text: string; adminOnly?: boolean }> = {
  upgraded: { tone: "ok", text: "お申し込みありがとうございます。反映まで数十秒かかることがあります。" },
  "admin-mfa": { tone: "warn", text: "管理画面を開くには、二段階認証の設定が必要です。", adminOnly: true },
  "drive-connected": { tone: "ok", text: "Googleドライブに接続しました。" },
  "drive-cancelled": { tone: "warn", text: "Googleドライブへの接続をやめました。" },
  "drive-noscope": { tone: "warn", text: "Googleドライブの許可にチェックが入っていませんでした。もう一度接続し、ドライブの許可にチェックを入れてください。" },
  "drive-failed": { tone: "warn", text: "Googleドライブに接続できませんでした。時間をおいてもう一度お試しください。" },
  "drive-unavailable": { tone: "warn", text: "Googleドライブへの接続は、ただいま準備中です。" },
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
  const labels = await getPlanLabels();
  // Googleドライブに接続済みか(リフレッシュトークンが保存されているか。値そのものは読まない)
  let driveConnected = false;
  if (!DEMO) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("oshikatsu_gdrive_tokens")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", viewer.id);
    driveConnected = (count ?? 0) > 0;
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-5 pb-8">
      <div>
        <Link href="/app" className="text-[13px] text-muted hover:text-text">
          ← 投稿
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
        <div className="mt-4 border-t border-line pt-4">
          <DrivePanel connected={driveConnected} available={!DEMO && driveConfigured()} />
        </div>
      </Section>

      <Section title="Subscription">
        {/* プラン名・Stripe・料金ページを同じ大きさで横に3等分して並べる */}
        <div className="grid grid-cols-3 gap-2">
          <span
            className={`flex h-10 w-full items-center justify-center rounded-lg px-2 text-[13px] font-bold ${
              viewer.plan === "master" ? "bg-warn/15 text-warn" : viewer.plan === "paid" || viewer.plan === "advanced" ? "bg-brand/15 text-brand" : "bg-sunken text-muted"
            }`}
          >
            <span className="truncate">{labels[viewer.plan]}</span>
          </span>
          {stripe ? (
            <a href={stripe} target="_blank" rel="noopener noreferrer" className="flex h-10 w-full items-center justify-center rounded-lg px-2 text-[13px] font-bold bg-brand text-brand-ink hover:opacity-90">
              Stripe
            </a>
          ) : (
            <span className="flex h-10 w-full items-center justify-center rounded-lg px-2 text-[13px] font-bold bg-brand text-brand-ink opacity-50" aria-disabled="true">
              Stripe
            </span>
          )}
          <Link href="/pricing" className="flex h-10 w-full items-center justify-center rounded-lg px-2 text-[13px] font-bold border border-line hover:bg-sunken">
            料金ページ
          </Link>
        </div>
      </Section>

      {/* 保存した投稿(Developer だけ。新着の画面の反応ボタンの短押しで保存したもの) */}
      {viewer.plan === "master" ? (
        <Section title="Saved">
          <Link href="/app/saved" className="flex h-10 w-full items-center justify-center rounded-lg border border-line px-2 text-[13px] font-bold hover:bg-sunken">
            保存した投稿
          </Link>
        </Section>
      ) : null}

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
