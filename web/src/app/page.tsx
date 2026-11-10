import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Wordmark } from "@/components/header";
import { OceanScene } from "@/components/landing/ocean-scene";
import { Reveal, ViewModeShowcase } from "@/components/landing/scroll";
import { buttonClass } from "@/components/ui";
import { DEMO } from "@/lib/env";

// アプリの入口(TOP)。ログインしていない人が最初に見るページ。ログイン済みの人は投稿の画面へ移る(proxy.ts)
export const metadata: Metadata = { title: "TOP" };

// 3Dが使えない端末向けの灯り(CSSだけで描く)。3Dの準備ができたら自動的に置き換わる。
const COLORS = ["#E5484D", "#F08A24", "#E8C21A", "#8CC63F", "#5FD3B4", "#3FC8E4", "#3B6FE0", "#8E5AD6", "#EC6FA9"];
const HEIGHTS = [58, 82, 66, 96, 74, 110, 70, 90, 62, 104, 78, 68, 98, 60, 86, 72, 108, 64];
const LIGHTS = HEIGHTS.map((height, index) => ({ id: index, height, color: COLORS[index % COLORS.length] }));

const POINTS = [
  {
    title: "推しの投稿をスワイプで",
    body: "YouTube・X・Instagram・TikTok の投稿を、推しごとに1本の流れにまとめます。上下のスワイプで次々に見られます。",
  },
  {
    title: "ギャラリーとカレンダー",
    body: "左右のスワイプで、推しの写真・チェキのギャラリーと、LIVE・チェキのカレンダーに切り替わります。",
  },
  {
    title: "写真はあなたのGoogleドライブに",
    body: "ギャラリーやチェキの写真は、Googleアカウントに紐づくGoogleドライブに保存します。",
  },
];

function FallbackLights() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-5 top-[calc(100dvh-180px)] mx-auto max-w-[1040px]">
      <div className="flex items-end justify-between px-1">
        {LIGHTS.map((light, index) => (
          <span
            key={light.id}
            className="light hero-light block w-[clamp(6px,1.2vw,12px)]"
            style={{ "--c": light.color, "--i": index, height: light.height } as CSSProperties}
          />
        ))}
      </div>
      <div className="mt-2 h-px bg-line" />
    </div>
  );
}

export default function LandingPage() {
  const start = DEMO ? "/app" : "/login";
  const startLabel = DEMO ? "デモを見る" : "Googleでログインして始める";

  return (
    <div className="relative isolate">
      <OceanScene>
        <FallbackLights />
      </OceanScene>

      <div className="mx-auto max-w-[1080px] px-5">
        <section className="flex min-h-dvh flex-col">
          <header className="flex h-14 shrink-0 items-center justify-between">
            <Wordmark />
            <div className="flex items-center gap-1">
              <Link href={start} className={buttonClass("secondary", "sm")}>
                ログイン
              </Link>
            </div>
          </header>

          <div className="flex flex-1 flex-col justify-center pb-[34dvh]">
            <h1 className="font-display text-[clamp(40px,9vw,88px)] leading-[1.1] tracking-wide">推しに溺れたい</h1>
            <p className="mt-6 max-w-[34em] text-[17px] leading-8 text-muted">
              推しのSNSの投稿を、推しごとにまとめてスワイプで。あちこちのアプリを行き来する時間を、推しを見る時間に。
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href={start} className={buttonClass("primary", "md", "h-12 px-6 text-[15px]")}>
                {startLabel}
              </Link>
              <span className="text-[13px] text-muted">推し3人までは無料で使えます</span>
            </div>
          </div>
        </section>

        <ViewModeShowcase />

        <section className="grid gap-5 py-[18dvh] md:grid-cols-3">
          {POINTS.map((point, index) => (
            <Reveal key={point.title} delay={index * 120}>
              <div className="glass h-full rounded-2xl border border-line p-6">
                <h2 className="text-base leading-6 font-bold">{point.title}</h2>
                <p className="mt-3 text-sm leading-7 text-muted">{point.body}</p>
              </div>
            </Reveal>
          ))}
        </section>

        <section className="flex min-h-[70dvh] flex-col items-start justify-center pb-16">
          <Reveal>
            <h2 className="font-display text-[clamp(28px,6vw,56px)] leading-[1.15] tracking-wide">
              深いところまで、どうぞ
            </h2>
            <p className="mt-5 max-w-[32em] text-[15px] leading-7 text-muted">
              登録はGoogleアカウントだけ。推しの名前と色を決めて、SNSのURLを貼れば始められます。
            </p>
            <Link href={start} className={buttonClass("primary", "md", "mt-8 h-12 px-6 text-[15px]")}>
              {startLabel}
            </Link>
          </Reveal>
        </section>

        <footer className="glass -mx-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line px-5 py-6 text-[13px] text-muted">
          <Link href="/legal/terms" className="hover:text-text">利用規約</Link>
          <Link href="/legal/privacy" className="hover:text-text">プライバシーポリシー</Link>
          <Link href="/legal/tokushoho" className="hover:text-text">特定商取引法に基づく表記</Link>
          <span className="ml-auto">非公式のファン向けツールです。各サービス・事務所とは関係ありません。</span>
        </footer>
      </div>
    </div>
  );
}
