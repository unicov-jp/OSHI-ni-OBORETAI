"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Light } from "@/components/ui";

// 画面に入ったときに一度だけ現れる。順番に出したいときは delay(ミリ秒)をずらす。
// JavaScriptが動かない環境や「視差効果を減らす」設定では、最初から表示したままにする(globals.css)。
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          element.classList.add("is-in");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const MODES = [
  {
    label: "推し",
    caption: "ひとりずつ追いかける",
    tabs: [
      { name: "汐見 うた", colors: ["#3FC8E4"], unread: 2 },
      { name: "波多野 りん", colors: ["#EC6FA9"], unread: 1 },
      { name: "真砂 こはく", colors: ["#F08A24"], unread: 2 },
      { name: "夜凪 しずく", colors: ["#8E5AD6"], unread: 1 },
      { name: "灯台守のトーリ", colors: ["#8CC63F"], unread: 2 },
    ],
  },
  {
    label: "グループ",
    caption: "グループの動きをまとめて見る",
    tabs: [
      { name: "ミナモ区立合唱部", colors: ["#3FC8E4", "#EC6FA9", "#F08A24"], unread: 5 },
      { name: "夜更かしラジオ体操第二", colors: ["#8E5AD6"], unread: 1 },
      { name: "未分類", colors: ["#8CC63F"], unread: 2 },
    ],
  },
  {
    label: "事務所",
    caption: "事務所ごとに束ねる",
    tabs: [
      { name: "しおさいプロダクション", colors: ["#3FC8E4", "#EC6FA9", "#F08A24"], unread: 5 },
      { name: "個人勢", colors: ["#8E5AD6", "#8CC63F"], unread: 3 },
    ],
  },
  {
    label: "ジャンル",
    caption: "ジャンルで切り替える",
    tabs: [
      { name: "アイドル", colors: ["#3FC8E4", "#EC6FA9", "#F08A24"], unread: 5 },
      { name: "配信者", colors: ["#8E5AD6", "#8CC63F"], unread: 3 },
    ],
  },
];

// スクロールに合わせて、傾いた画面の模型が正面を向き、まとめ方が 推し→グループ→事務所→ジャンル と切り替わる。
// 模型の名前はすべて架空のもの。
export function ViewModeShowcase() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const update = () => {
      frame = 0;
      const rect = track.getBoundingClientRect();
      const range = rect.height - window.innerHeight;
      const progress = range > 0 ? Math.min(1, Math.max(0, -rect.top / range)) : 0;
      // 前半で起き上がり、全体を通してまとめ方が4段階で切り替わる
      track.style.setProperty("--tilt", reduceMotion ? "0" : String(1 - Math.min(1, progress / 0.3)));
      setMode(Math.min(MODES.length - 1, Math.floor(progress * MODES.length)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const current = MODES[mode];

  return (
    <div ref={trackRef} className="relative h-[320vh]" style={{ "--tilt": 1 } as CSSProperties}>
      <div className="sticky top-0 flex h-dvh flex-col justify-center gap-8 py-10 md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-center md:gap-12">
        <div className="glass rounded-2xl border border-line p-6">
          <h2 className="text-[clamp(22px,3.4vw,34px)] leading-tight font-bold">まとめ方は、あとから何度でも変えられます</h2>
          <p className="mt-4 max-w-[30em] text-[15px] leading-7 text-muted">
            登録はそのまま、見る単位だけを切り替えます。今日はひとりを深く、明日はグループ全体を流し見、という使い方ができます。
          </p>
          <ol className="mt-6 grid grid-cols-4 gap-2 md:max-w-[420px]">
            {MODES.map((item, index) => (
              <li
                key={item.label}
                aria-current={index === mode ? "step" : undefined}
                className={`flex h-10 items-center justify-center rounded-lg border text-[13px] font-medium whitespace-nowrap transition-colors ${
                  index === mode ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface/70 text-muted"
                }`}
              >
                {item.label}
              </li>
            ))}
          </ol>
          <p className="mt-3 h-6 text-sm text-muted" aria-live="polite">
            {current.caption}
          </p>
        </div>

        <div className="[perspective:1400px]" aria-hidden>
          <div
            className="showcase-panel mx-auto w-full max-w-[460px] rounded-2xl border border-line bg-surface p-4 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.5)]"
          >
            <div className="grid h-10 grid-cols-4 rounded-lg border border-line bg-sunken p-[3px]">
              {MODES.map((item, index) => (
                <span
                  key={item.label}
                  className={`flex items-center justify-center rounded-md text-[13px] font-medium whitespace-nowrap ${
                    index === mode ? "bg-surface text-text shadow-sm" : "text-muted"
                  }`}
                >
                  {item.label}
                </span>
              ))}
            </div>
            {/* 段数が変わっても枠の高さは変えない(5行ぶんを常に確保) */}
            <div className="mt-3 flex h-[272px] flex-col gap-1">
              {current.tabs.map((tab, index) => (
                <div
                  key={`${mode}-${tab.name}`}
                  className={`showcase-row flex h-12 shrink-0 items-center gap-3 rounded-lg border px-3 ${
                    index === 0 ? "border-line bg-sunken" : "border-transparent"
                  }`}
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  <span className="flex shrink-0 items-end gap-[3px]">
                    {tab.colors.map((color) => (
                      <Light key={color} color={color} className="h-7 w-[5px]" />
                    ))}
                  </span>
                  <span className="clamp-1 flex-1 text-sm font-medium">{tab.name}</span>
                  <span className="num flex h-5 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-ink">
                    {tab.unread}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
