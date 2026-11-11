"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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

// 模型に出す推し(名前はすべて架空のもの)
const OSHI = [
  { name: "夜凪 しずく", mark: "夜", color: "#8E5AD6", unread: 3 },
  { name: "波多野 りん", mark: "波", color: "#EC6FA9", unread: 1 },
  { name: "汐見 うた", mark: "汐", color: "#3FC8E4", unread: 5 },
  { name: "真砂 こはく", mark: "真", color: "#F08A24", unread: 2 },
  { name: "灯台守のトーリ", mark: "灯", color: "#8CC63F", unread: 0 },
];

const SCENES = [
  {
    label: "新着",
    title: "推しの投稿を、上下のスワイプで",
    body: "YouTube・Blog・X・Instagram・TikTok の投稿を、推しごとに1本の流れにまとめます。上のアイコンの数字は、まだ見ていない投稿の件数です。",
  },
  {
    label: "ギャラリー",
    title: "左へスワイプでギャラリー",
    body: "推しの写真とチェキを全画面で。推しごとに登録した BGM(YouTube)が流れます。プレーヤーは長押しで好きな位置へ動かせます。",
  },
  {
    label: "カレンダー",
    title: "右へスワイプでカレンダー",
    body: "LIVE とチェキの記録を月ごとに。現地・チケット・配信のリンクも、その日の予定からすぐ開けます。",
  },
  {
    label: "長押し",
    title: "推しのアイコンを長押しで",
    body: "推し情報の更新・新規登録に加えて、お気に入りの過去の YouTube 動画を URL で推しの流れに足せます。",
  },
];

function Avatar({ mark, color, size = 28, dim = false }: { mark: string; color: string; size?: number; dim?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${dim ? "opacity-55" : ""}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {mark}
    </span>
  );
}

// 上の推しのアイコンの並び(数字は未読の件数)
function Strip() {
  return (
    <div className="flex items-center justify-between px-2 pt-2">
      {OSHI.map((o, i) => (
        <span key={o.name} className="relative">
          <Avatar mark={o.mark} color={o.color} size={34} dim={i > 0} />
          {o.unread > 0 ? (
            <span className="num absolute -top-1 -right-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#ff2d6f] px-1 text-[9px] font-bold text-white">
              {o.unread}
            </span>
          ) : null}
          {i === 0 ? <span className="absolute -bottom-1.5 left-1/2 h-[2px] w-3 -translate-x-1/2 rounded-full bg-white" /> : null}
        </span>
      ))}
    </div>
  );
}

function SideButtons() {
  const round = "flex h-8 w-8 items-center justify-center rounded-full bg-white/15";
  return (
    <div className="absolute right-2 bottom-4 flex flex-col items-center gap-2.5 text-[8px] font-bold text-white">
      <Avatar mark="夜" color="#8E5AD6" size={32} />
      <span className="flex flex-col items-center gap-0.5">
        <span className={`${round} bg-[#ff2d6f]`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z" /></svg>
        </span>
        保存済み
      </span>
      <span className="flex flex-col items-center gap-0.5">
        <span className={round}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
        </span>
        共有
      </span>
      <span className="flex flex-col items-center gap-0.5">
        <span className={round}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7" /></svg>
        </span>
        音あり
      </span>
    </div>
  );
}

function FeedScene() {
  return (
    <>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 70% at 40% 35%, #8E5AD6aa, #000 72%)" }} />
      <div className="relative">
        <Strip />
      </div>
      {/* 動画の枠 */}
      <div className="absolute inset-x-3 top-[64px] aspect-video rounded-lg bg-black/60 ring-1 ring-white/10">
        <span className="absolute top-1/2 left-1/2 flex h-9 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-[#ff0033]">
          <span className="ml-0.5 h-0 w-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-white" />
        </span>
      </div>
      <div className="absolute bottom-4 left-3 max-w-[62%] text-white">
        <span className="rounded bg-white/15 px-1 py-0.5 text-[8px] font-bold">YouTube</span>
        <span className="ml-1 rounded bg-[#ff2d6f] px-1 py-0.5 text-[8px] font-bold">NEW</span>
        <p className="mt-1.5 text-[11px] leading-snug font-bold">【歌ってみた】深夜2時の子守唄</p>
        <p className="mt-0.5 text-[9px] text-white/70">夜凪 しずく・1時間前</p>
      </div>
      <SideButtons />
    </>
  );
}

function GalleryScene() {
  return (
    <>
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #EC6FA9 0%, #8E5AD6 45%, #1a1030 100%)" }} />
      {/* チェキの写真 */}
      <div className="absolute top-[70px] left-1/2 w-[58%] -translate-x-1/2 rotate-[-3deg] rounded-sm bg-white p-2 pb-6 shadow-2xl">
        <div className="aspect-square rounded-[2px]" style={{ background: "radial-gradient(80% 80% at 50% 40%, #ffd6e8, #8E5AD6)" }} />
        <p className="mt-1.5 text-center text-[9px] font-bold text-[#333]">11/3 夜更かしライブ</p>
      </div>
      <div className="relative">
        <Strip />
      </div>
      {/* BGM のプレーヤー */}
      <div className="absolute bottom-4 left-3 w-[92px] overflow-hidden rounded-xl bg-black/80 ring-1 ring-white/20">
        <div className="flex h-5 items-center justify-between px-2 text-[8px] font-bold text-white">
          <span>♪ BGM</span>
          <span className="text-white/60">たたむ</span>
        </div>
        <div className="flex aspect-square items-center justify-center bg-[#111]">
          <span className="flex h-6 w-8 items-center justify-center rounded-lg bg-[#ff0033]">
            <span className="ml-0.5 h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-white" />
          </span>
        </div>
      </div>
      <div className="absolute right-2 bottom-4 flex flex-col items-center gap-0.5 text-[8px] font-bold text-white">
        <Avatar mark="夜" color="#8E5AD6" size={32} />
        追加
      </div>
    </>
  );
}

function CalendarScene() {
  const marks: Record<number, string> = { 3: "#8E5AD6", 9: "#EC6FA9", 15: "#8E5AD6", 22: "#3FC8E4", 28: "#8E5AD6" };
  return (
    <>
      <div className="absolute inset-0 bg-black" />
      <div className="relative">
        <Strip />
        <p className="mt-3 text-center text-[12px] font-bold text-white">2026年11月</p>
        <div className="mt-1 grid grid-cols-7 gap-y-1 px-2 text-center text-[9px] text-white">
          {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
            <span key={d} className={i === 0 ? "text-[#ff6b8f]" : i === 6 ? "text-sky-400" : "text-white/50"}>
              {d}
            </span>
          ))}
          {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => (
            <span key={day} className="flex flex-col items-center">
              <span className={`flex h-[18px] w-[18px] items-center justify-center rounded-md ${day === 15 ? "bg-white text-black" : ""}`}>{day}</span>
              <span className="mt-0.5 h-1 w-1 rounded-full" style={{ background: marks[day] ?? "transparent" }} />
            </span>
          ))}
        </div>
        <div className="mx-2 mt-2 rounded-lg bg-white/10 p-2 text-white">
          <p className="text-[9px] text-white/60">11月15日(日) LIVE</p>
          <p className="text-[11px] font-bold">夜更かしワンマン vol.3</p>
          <div className="mt-1.5 flex gap-1">
            {["現地", "チケット", "配信"].map((label) => (
              <span key={label} className="rounded-full bg-white/15 px-2 py-0.5 text-[8px] font-bold">
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function MenuScene() {
  return (
    <>
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 70% at 40% 35%, #8E5AD6aa, #000 72%)" }} />
      <div className="relative">
        <Strip />
      </div>
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-[#111] px-2.5 pt-2 pb-3 text-white">
        <span className="mx-auto mb-2 block h-[3px] w-7 rounded-full bg-white/25" />
        <div className="mb-2 flex items-center gap-2 px-0.5">
          <Avatar mark="夜" color="#8E5AD6" size={26} />
          <span className="text-[12px] font-bold">夜凪 しずく</span>
        </div>
        <div className="divide-y divide-white/10 overflow-hidden rounded-xl bg-white/5 text-[11px] font-semibold">
          {["推し情報の更新", "推し情報の新規登録", "個別投稿の更新"].map((label) => (
            <p key={label} className="px-3 py-2.5">
              {label}
            </p>
          ))}
        </div>
        <p className="mt-2 rounded-xl bg-white/10 py-2 text-center text-[11px] font-semibold">閉じる</p>
      </div>
    </>
  );
}

const SCENE_VIEWS = [FeedScene, GalleryScene, CalendarScene, MenuScene];

// スクロールに合わせて、傾いたスマホの模型が正面を向き、画面が 新着→ギャラリー→カレンダー→長押しのメニュー と切り替わる。
// 模型の名前・投稿はすべて架空のもの。
export function ViewModeShowcase() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState(0);

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
      // 前半で起き上がり、全体を通して画面が4段階で切り替わる
      track.style.setProperty("--tilt", reduceMotion ? "0" : String(1 - Math.min(1, progress / 0.3)));
      setScene(Math.min(SCENES.length - 1, Math.floor(progress * SCENES.length)));
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

  const current = SCENES[scene];
  const View = SCENE_VIEWS[scene];

  return (
    <div ref={trackRef} className="relative h-[360vh]" style={{ "--tilt": 1 } as CSSProperties}>
      <div className="sticky top-0 flex h-dvh flex-col justify-center gap-6 py-8 md:grid md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] md:items-center md:gap-12">
        <div className="glass rounded-2xl border border-line p-5 md:p-6">
          <ol className="grid grid-cols-4 gap-2 md:max-w-[420px]">
            {SCENES.map((item, index) => (
              <li
                key={item.label}
                aria-current={index === scene ? "step" : undefined}
                className={`flex h-9 items-center justify-center rounded-lg border text-[13px] font-medium whitespace-nowrap transition-colors ${
                  index === scene ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface/70 text-muted"
                }`}
              >
                {item.label}
              </li>
            ))}
          </ol>
          <div aria-live="polite">
            <h2 className="mt-4 text-[clamp(20px,3vw,30px)] leading-tight font-bold">{current.title}</h2>
            <p className="mt-3 min-h-[5.25em] max-w-[30em] text-[14px] leading-7 text-muted md:text-[15px]">{current.body}</p>
          </div>
        </div>

        <div className="[perspective:1400px]" aria-hidden>
          <div className="showcase-panel mx-auto w-[min(54vw,230px)] rounded-[34px] border-[6px] border-[#222] bg-black p-0 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.6)] md:w-[280px]">
            <div key={scene} className="showcase-row relative aspect-[9/17] overflow-hidden rounded-[28px]">
              <View />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
