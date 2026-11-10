import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { FREE_OSHI, getPriceTiers, yen } from "@/lib/pricing";

export const metadata: Metadata = { title: "料金" };
// 料金は管理画面で変えるので、開くたびに読み直す
export const dynamic = "force-dynamic";

// 料金ページ(ログインしていなくても見られる)。
// 無料は推し3人まで。Subscription は登録する推しの人数で月額が変わる(金額は管理画面の「料金」で決める)

const COMMON = [
  "推しごとの新着(YouTube・Blog・X・Instagram・TikTok)をスワイプで見る",
  "ギャラリー(推しの写真・チェキ)",
  "カレンダー(LIVE・チェキの記録)",
];

function Check() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10.5l4 4 8-9" />
    </svg>
  );
}

export default async function PricingPage() {
  const tiers = await getPriceTiers();
  const lowest = tiers[0];

  return (
    <main className="mx-auto max-w-[760px] space-y-6 px-4 py-8">
      <div>
        <Link href="/app/settings" className="text-[13px] text-muted hover:text-text">
          ← 設定に戻る
        </Link>
        <h1 className="mt-1 text-2xl font-bold">料金</h1>
        <p className="mt-2 text-sm text-muted">
          推し{FREE_OSHI}人までは無料です。それより多く登録するときは Subscription に切り替えます。月額は登録する推しの人数で変わります。
        </p>
      </div>

      {/* 無料 */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">無料</h2>
          <span className="text-xs text-muted">まずはお試しに</span>
        </div>
        <p className="num mt-2 text-2xl font-bold">0円</p>
        <p className="num mt-1 text-sm text-muted">推し{FREE_OSHI}人まで・新着を取るSNS・Blog 15件まで</p>
      </section>

      {/* Subscription: 人数ごとの月額 */}
      <section className="rounded-2xl border border-brand bg-brand/5 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">Subscription</h2>
          <span className="text-xs text-muted">推しが多い人に</span>
        </div>
        {lowest ? (
          <>
            <p className="num mt-2 text-2xl font-bold">
              月額{yen(lowest.monthly_yen)}
              <span className="text-sm font-normal text-muted">〜</span>
            </p>
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl bg-sunken">
              {tiers.map((tier, i) => {
                const from = (i === 0 ? FREE_OSHI : tiers[i - 1].max_oshi) + 1;
                return (
                  <li key={tier.max_oshi} className="num flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm">
                      推し <b className="text-base">{from}〜{tier.max_oshi}人</b>
                    </span>
                    <span className="text-base font-bold">月額{yen(tier.monthly_yen)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="num mt-3 text-xs text-muted">新着を取るSNS・Blog は300件まで。人数を増やしたときは、その人数の月額に切り替わります。</p>
          </>
        ) : (
          <p className="mt-2 text-2xl font-bold">準備中</p>
        )}
      </section>

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
