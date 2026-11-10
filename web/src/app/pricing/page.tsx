import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "料金" };

// 料金ページ(ログインしていなくても見られる)。金額は Vercel の環境変数 SUBSCRIPTION_PRICE_LABEL(例: 月額480円)で表示する。
// スマホで見やすいよう、表ではなくプランごとのカードを縦に並べる。違いは数字を大きく、共通の機能はまとめて書く

type Plan = {
  name: string;
  price: string;
  note: string;
  oshi: string;
  sources: string;
  highlight?: boolean;
};

const COMMON = [
  "推しごとの新着(YouTube・Blog・X・Instagram・TikTok)をスワイプで見る",
  "ギャラリー(推しの写真・チェキ)",
  "カレンダー(LIVE・チェキの記録)",
  "今のアプリ(推し活手帳)と記録を共有",
];

function Check() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

export default function PricingPage() {
  const price = process.env.SUBSCRIPTION_PRICE_LABEL || "準備中";
  const plans: Plan[] = [
    { name: "無料", price: "0円", note: "まずはお試しに", oshi: "3人", sources: "15件" },
    { name: "Subscription", price, note: "推しが多い人に", oshi: "50人", sources: "300件", highlight: true },
  ];

  return (
    <main className="mx-auto max-w-[760px] space-y-6 px-4 py-8">
      <div>
        <Link href="/app/settings" className="text-[13px] text-muted hover:text-text">
          ← 設定に戻る
        </Link>
        <h1 className="mt-1 text-2xl font-bold">料金</h1>
        <p className="mt-2 text-sm text-muted">無料で始めて、推しが増えたら Subscription に切り替えられます。違いは登録できる数だけです。</p>
      </div>

      {/* プランごとのカード: 違い(登録できる数)を大きく見せる */}
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <section
            key={plan.name}
            className={`rounded-2xl border p-5 ${plan.highlight ? "border-brand bg-brand/5" : "border-line bg-surface"}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-bold">{plan.name}</h2>
              <span className="text-xs text-muted">{plan.note}</span>
            </div>
            <p className="num mt-2 text-2xl font-bold">{plan.price}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-sunken px-3 py-3">
                <dt className="text-xs text-muted">登録できる推し</dt>
                <dd className="num mt-1 text-xl font-bold">{plan.oshi}</dd>
              </div>
              <div className="rounded-xl bg-sunken px-3 py-3">
                <dt className="text-xs text-muted">新着を取るSNS・Blog</dt>
                <dd className="num mt-1 text-xl font-bold">{plan.sources}</dd>
              </div>
            </dl>
          </section>
        ))}
      </div>

      {/* どちらのプランでも使えること */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-[15px] font-bold">どちらのプランでも使えること</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {COMMON.map((item) => (
            <li key={item} className="flex gap-2">
              <Check />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 写真の保存先 */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-[15px] font-bold">写真の保存先</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          ギャラリー・チェキ・LIVEのポスター・推しのアイコンの写真は、Google アカウントに紐づく Google ドライブ(「推しに溺れたいapp」フォルダ)に保存されます。写真の容量は、その Google ドライブの空き容量を使います。
        </p>
      </section>

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
