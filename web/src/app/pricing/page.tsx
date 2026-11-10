import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "料金" };

// 料金ページ(ログインしていなくても見られる)。金額は Vercel の環境変数 SUBSCRIPTION_PRICE_LABEL(例: 月額480円)で表示する
export default function PricingPage() {
  const price = process.env.SUBSCRIPTION_PRICE_LABEL || "準備中";
  const rows: [string, string, string][] = [
    ["登録できる推し", "3人", "50人"],
    ["新着を取るSNS・Blog", "15件", "300件"],
    ["新着(YouTube・Blog・X・Instagram・TikTok)", "○", "○"],
    ["推しの記録(今のアプリと共通)", "○", "○"],
  ];
  return (
    <main className="mx-auto max-w-[760px] space-y-6 px-4 py-8">
      <div>
        <Link href="/app/settings" className="text-[13px] text-muted hover:text-text">
          ← 設定に戻る
        </Link>
        <h1 className="mt-1 text-2xl font-bold">料金</h1>
        <p className="mt-2 text-sm text-muted">無料で始めて、推しが増えたらサブスク(有料プラン)に切り替えられます。</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="data-table text-sm">
          <thead>
            <tr>
              <th className="w-[46%]">できること</th>
              <th>無料</th>
              <th>サブスク({price})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, free, paid]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="num">{free}</td>
                <td className="num">{paid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        お支払いは Stripe の画面で行います。カード情報は当アプリには保存されません。
        <Link href="/legal/tokushoho" className="ml-1 underline">
          特定商取引法に基づく表記
        </Link>
      </p>
      <Link href="/app/settings" className={buttonClass("secondary")}>
        設定に戻る
      </Link>
    </main>
  );
}
