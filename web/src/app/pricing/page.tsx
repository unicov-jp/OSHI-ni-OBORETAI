import type { Metadata } from "next";
import Link from "next/link";
import { PriceSimulator } from "@/components/price-simulator";
import { buttonClass } from "@/components/ui";
import { getPlanLabels } from "@/lib/plan-names";
import { FREE_OSHI, getPerOshiPrice, PAID_MAX_OSHI } from "@/lib/pricing";

export const metadata: Metadata = { title: "料金" };
// 料金は管理画面で変えるので、開くたびに読み直す
export const dynamic = "force-dynamic";

// 料金ページ(ログインしていなくても見られる)。
// 無料は推し3人まで。Subscription はそれを超えた推し1人ごとに月額を加算する(1人あたりの金額は管理画面の「料金」で決める)。
// ▲▼で人数を変えると、その人数の月額を出す。Blog は登録できるが、ファンクラブ限定のこともあるため料金表には書かない

const COMMON = [
  "推しごとの投稿(YouTube・X・Instagram・TikTok)をスワイプで見る",
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
  const [perOshi, labels] = await Promise.all([getPerOshiPrice(), getPlanLabels()]);

  return (
    <main className="mx-auto max-w-[760px] space-y-6 px-4 py-8">
      <div>
        <Link href="/" className="text-[13px] text-muted hover:text-text">
          ← TOP
        </Link>
        <h1 className="mt-1 text-2xl font-bold">料金</h1>
        <p className="mt-2 text-sm text-muted">
          推し{FREE_OSHI}人までは無料です。それより多く登録するときは「{labels.paid}」に切り替えます。月額は、増やした推しの人数ぶんだけ加算されます。
        </p>
      </div>

      {/* 無料 */}
      <section className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">{labels.free}</h2>
          <span className="num text-sm">
            <b className="text-base">0円</b>
          </span>
        </div>
        <p className="num mt-1 text-xs text-muted">推し{FREE_OSHI}人まで・SNS 15件まで</p>
      </section>

      {/* Subscription: 1人あたりの月額と、▼▲で人数を変えたときの月額 */}
      <section className="rounded-2xl border border-brand bg-brand/5 p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-bold">{labels.paid}</h2>
          {perOshi === null ? <span className="text-sm">準備中</span> : null}
        </div>
        {perOshi !== null ? (
          <>
            <PriceSimulator perOshi={perOshi} freeOshi={FREE_OSHI} maxOshi={PAID_MAX_OSHI} />
            <p className="num mt-2 text-xs text-muted">
              推し{PAID_MAX_OSHI}人まで・SNS 300件まで
            </p>
          </>
        ) : null}
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
      <Link href="/" className={buttonClass("secondary")}>
        TOPに戻る
      </Link>
    </main>
  );
}
