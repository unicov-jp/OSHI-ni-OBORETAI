"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { EmbedCard, InstagramPost, XPostEmbed } from "@/components/embeds";
import { OshiAvatar } from "@/components/oshi-avatar";
import { formatRelative } from "@/components/ui";
import { loadMore, markSeen } from "@/lib/actions/oshi";
import { isYoutubeShort, PLATFORM_LABEL, youtubeVideoId } from "@/lib/platforms";
import { decodeEntities, hostOf } from "@/lib/text";
import type { Oshi, Platform, Source, TimelineItem } from "@/lib/types";

// TikTok 風の新着。推しを1人選び、その推しと所属グループの新着(動画・記事・X・Instagram・TikTok)を
// 1本の流れにして、上下のスワイプで1件ずつ見る。左右のスワイプで隣の推しに移る。
// 画面に出ている1件だけを読み込み・再生し(音なしで自動再生)、ほかは静止画にして軽くする。

type Props = {
  isAdmin: boolean;
  oshi: Oshi[];
  active: Oshi;
  unread: Record<string, number>;
  sources: Source[];
  // Instagram のアカウントごとの最新の投稿のコード(読めなかったアカウントは空)
  instagram: Record<string, string[]>;
  // X のアカウントごとの最新の投稿(番号と日時。読めなかったアカウントは空)
  x: Record<string, { id: string; at: string }[]>;
  // TikTok のアカウントごとの最新の動画(番号と日時。日時は読めないこともある)
  tiktok: Record<string, { id: string; at: string | null }[]>;
  items: TimelineItem[];
  pageSize: number;
};

const EMBED_PLATFORMS: Platform[] = ["x", "instagram", "tiktok"];
// 新着(動画・記事)何件ごとに、X・Instagram・TikTok の画面を1枚はさむか
const EMBED_EVERY = 3;

// 右側のボタン(ミュート・設定・管理)が使う共通の状態
// activated: 画面をもう触ったか。ブラウザは、一度も触っていないうちは自動再生で音を出させない
const Controls = createContext<{
  muted: boolean; toggleMute: () => void; activated: boolean; activate: () => void; isAdmin: boolean;
}>({
  muted: false,
  toggleMute: () => {},
  activated: true,
  activate: () => {},
  isAdmin: false,
});

type Slide =
  | { kind: "item"; key: string; item: TimelineItem; from: string }
  | { kind: "embed"; key: string; source: Source; from: string }
  | { kind: "insta"; key: string; source: Source; from: string; code: string }
  | { kind: "tweet"; key: string; source: Source; from: string; id: string; at: string }
  | { kind: "tiktok"; key: string; source: Source; from: string; id: string; at: string | null };

const normalizeUrl = (url: string) => url.toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/+$/, "");

export function SwipeFeed({ isAdmin, oshi, active, unread, sources, instagram, x, tiktok, items: initialItems, pageSize }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialItems.length >= pageSize);
  const [current, setCurrent] = useState(0);
  // 音は最初からオン(実際に鳴るかは端末の音量・マナーモードの設定による)
  const [muted, setMuted] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, startTransition] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  const activeTab = useRef<HTMLAnchorElement>(null);

  // 推しを選び直すと画面が作り直されて上の並びが左端に戻るので、選んだ推しを真ん中あたりに戻す
  useEffect(() => {
    activeTab.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" as ScrollBehavior });
  }, []);

  // 登録したアカウントが「本人」か「どのグループ」のものか(今のアプリの登録から分かる)
  const fromOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const sns of active.sns) map.set(normalizeUrl(sns.url), sns.from);
    const bySource = new Map<string, string>();
    for (const source of sources) bySource.set(source.id, map.get(normalizeUrl(source.url)) ?? "");
    return bySource;
  }, [active.sns, sources]);

  // 同じ項目が重なって届いた場合は1枚にする。X・Instagram・TikTok は数件ごとに1枚はさむ
  const slides = useMemo(() => {
    const seen = new Set<string>();
    const dated: { at: string; slide: Slide }[] = [];
    for (const item of items) {
      if (seen.has(item.item_id)) continue;
      seen.add(item.item_id);
      dated.push({ at: item.published_at, slide: { kind: "item", key: `i-${item.item_id}`, item, from: fromOf.get(item.source_id) ?? "" } });
    }
    // X の投稿は日時があるので、動画・記事と日時の順に混ぜる
    for (const source of sources.filter((s) => s.platform === "x")) {
      for (const post of x[source.id] ?? []) {
        if (seen.has(`x-${post.id}`)) continue;
        seen.add(`x-${post.id}`);
        dated.push({
          at: post.at,
          slide: { kind: "tweet", key: `t-${post.id}`, source, from: fromOf.get(source.id) ?? "", id: post.id, at: post.at },
        });
      }
    }
    // TikTok の動画も、日時が分かるものは日時の順に混ぜる
    const undated: Slide[] = [];
    for (const source of sources.filter((s) => s.platform === "tiktok")) {
      for (const video of tiktok[source.id] ?? []) {
        if (seen.has(`tt-${video.id}`)) continue;
        seen.add(`tt-${video.id}`);
        const slide: Slide = { kind: "tiktok", key: `v-${video.id}`, source, from: fromOf.get(source.id) ?? "", id: video.id, at: video.at };
        if (video.at) dated.push({ at: video.at, slide });
        else undated.push(slide);
      }
    }
    const cards = dated.sort((a, b) => (a.at < b.at ? 1 : -1)).map((d) => d.slide);
    // Instagram は投稿1件ずつ(読めたとき)。X・TikTok と、投稿を読めなかった Instagram はアカウントの表示
    const embeds: Slide[] = [...undated];
    for (const source of sources.filter((s) => EMBED_PLATFORMS.includes(s.platform))) {
      const from = fromOf.get(source.id) ?? "";
      const codes = source.platform === "instagram" ? (instagram[source.id] ?? []) : [];
      // 投稿を読めた X は、上で日時の順に混ぜてあるのでアカウントの表示は出さない
      if (source.platform === "x" && (x[source.id] ?? []).length > 0) continue;
      if (source.platform === "tiktok" && (tiktok[source.id] ?? []).length > 0) continue;
      if (codes.length > 0) {
        for (const code of codes) embeds.push({ kind: "insta", key: `p-${source.id}-${code}`, source, from, code });
      } else {
        embeds.push({ kind: "embed", key: `e-${source.id}`, source, from });
      }
    }
    const result: Slide[] = [];
    let e = 0;
    cards.forEach((card, index) => {
      result.push(card);
      if ((index + 1) % EMBED_EVERY === 0 && e < embeds.length) result.push(embeds[e++]);
    });
    while (e < embeds.length) result.push(embeds[e++]);
    return result;
  }, [items, sources, fromOf, instagram, x, tiktok]);

  // 画面に出ている1枚を調べる
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    for (const child of Array.from(root.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [slides.length]);

  // 終わりが近づいたら続きを読み込む
  useEffect(() => {
    if (!hasMore || pending || current < slides.length - 4) return;
    const last = items[items.length - 1];
    if (!last) return;
    startTransition(async () => {
      const result = await loadMore({ oshiIds: [active.id], before: last.published_at });
      if (!result.ok) return;
      const next = result.data ?? [];
      setItems((list) => [...list, ...next]);
      setHasMore(next.length >= pageSize);
    });
  }, [current, slides.length, hasMore, pending, items, active.id, pageSize]);

  // しばらく見たら既読にする
  const unreadCount = unread[active.id] ?? 0;
  useEffect(() => {
    if (unreadCount === 0) return;
    const timer = setTimeout(() => void markSeen([active.id]), 1500);
    return () => clearTimeout(timer);
  }, [active.id, unreadCount]);

  // 左右のスワイプで隣の推しへ
  const index = oshi.findIndex((o) => o.id === active.id);
  const go = useCallback(
    (step: number) => {
      const next = oshi[index + step];
      if (next) router.push(`/app?tab=${encodeURIComponent(next.id)}`);
    },
    [oshi, index, router],
  );
  const touch = useRef<{ x: number; y: number } | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    setNote(null);
    try {
      const response = await fetch("/api/feeds/refresh", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; claimed?: number; added?: number };
      if (!response.ok) setNote(body.error ?? "更新できませんでした");
      else if (!body.claimed) setNote("最新の状態です");
      else {
        setNote(body.added ? `新着が${body.added}件ありました` : "新着はありませんでした");
        router.refresh();
      }
    } catch {
      setNote("通信できませんでした");
    } finally {
      setRefreshing(false);
      setTimeout(() => setNote(null), 4000);
    }
  };

  const [activated, setActivated] = useState(() =>
    typeof navigator === "undefined"
      ? true
      : ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true),
  );
  const controls = useMemo(
    () => ({
      muted,
      // まだ音を出せない状態で押されたら、ミュートにせず音を出す(この操作で音を出せるようになる)
      toggleMute: () => (activated ? setMuted((m) => !m) : (setActivated(true), setMuted(false))),
      activated,
      activate: () => setActivated(true),
      isAdmin,
    }),
    [muted, activated, isAdmin],
  );

  return (
    <Controls.Provider value={controls}>
    <div
      className="fixed inset-0 z-40 bg-black text-white md:top-14 md:z-20"
      onPointerDown={() => {
        if (!activated) setActivated(true);
      }}
      onTouchStart={(event) => {
        const t = event.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = event.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) go(dx < 0 ? 1 : -1);
      }}
    >
      {/* 上: 推しのタブ(推し単位のみ)と更新 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-black/70 to-transparent" />
      <nav aria-label="推し" className="scroll-x absolute inset-x-0 top-0 z-30 flex h-16 items-center gap-2 pr-16 pl-3">
        {oshi.map((o) => {
          const on = o.id === active.id;
          const count = unread[o.id] ?? 0;
          return (
            <Link
              key={o.id}
              href={`/app?tab=${encodeURIComponent(o.id)}`}
              replace
              ref={on ? activeTab : undefined}
              aria-current={on ? "page" : undefined}
              aria-label={o.name}
              title={o.name}
              className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${on ? "" : "opacity-55"}`}
            >
              <OshiAvatar oshi={o} size={on ? 40 : 34} />
              {on ? <span className="absolute -bottom-0.5 h-[3px] w-5 rounded-full bg-white" aria-hidden /> : null}
              {count > 0 ? (
                <span className="num absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff2d6f] px-1 text-[10px] font-bold text-white">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="pointer-events-none absolute top-0 right-0 z-30 h-16 w-20 bg-gradient-to-l from-black via-black/80 to-transparent" />
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        aria-label="新着を取りに行く"
        title="新着を取りに行く"
        className="absolute top-3 right-3 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-[0_4px_16px_rgba(0,0,0,.4)] backdrop-blur-md transition active:scale-90 disabled:opacity-70"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className={`h-[18px] w-[18px] ${refreshing ? "animate-spin" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 11a8 8 0 1 0-2.34 5.66" />
          <path d="M20 4v7h-7" />
        </svg>
      </button>
      {note ? (
        <p className="absolute top-16 left-1/2 z-30 -translate-x-1/2 rounded-full bg-white px-4 py-1.5 text-[13px] font-bold whitespace-nowrap text-black">
          {note}
        </p>
      ) : null}

      {slides.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
          <OshiAvatar oshi={active} size={72} />
          <p className="text-lg font-bold">{active.name}</p>
          <p className="text-sm text-white/70">
            {sources.length === 0
              ? "まだSNSが登録されていません。"
              : "新着はまだありません。右上の「↻」で今すぐ取りに行けます。"}
          </p>
          <Link href="/app/manage" className="flex h-11 items-center rounded-full bg-white px-6 text-sm font-bold text-black">
            SNSを登録する
          </Link>
        </div>
      ) : (
        <div ref={scroller} className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]">
          {slides.map((slide, i) => (
            <section key={slide.key} data-index={i} className="relative h-full w-full snap-start snap-always overflow-hidden">
              {slide.kind === "item" ? (
                <ItemSlide
                  item={slide.item}
                  from={slide.from}
                  oshi={active}
                  live={i === current}
                  near={Math.abs(i - current) <= 1}
                  muted={muted}
                  onToggleSound={() => setMuted((m) => !m)}
                />
              ) : slide.kind === "tiktok" ? (
                <TikTokSlide
                  source={slide.source}
                  id={slide.id}
                  at={slide.at}
                  from={slide.from}
                  oshi={active}
                  live={i === current}
                  muted={muted}
                  onToggleSound={() => setMuted((m) => !m)}
                />
              ) : slide.kind === "tweet" ? (
                <TweetSlide source={slide.source} id={slide.id} at={slide.at} from={slide.from} oshi={active} near={Math.abs(i - current) <= 1} />
              ) : slide.kind === "insta" ? (
                <InstaSlide source={slide.source} code={slide.code} from={slide.from} oshi={active} near={Math.abs(i - current) <= 1} />
              ) : (
                <EmbedSlide source={slide.source} from={slide.from} oshi={active} live={i === current} />
              )}
            </section>
          ))}
          {pending ? (
            <div className="flex h-24 items-center justify-center text-sm text-white/60">読み込み中</div>
          ) : null}
        </div>
      )}
    </div>
    </Controls.Provider>
  );
}

function fromLabel(from: string): string {
  return from && from !== "本人" ? `${from} の投稿` : "";
}

// 右側のボタン(推しのアイコン・開く・共有)
function Icon({ d }: { d: string[] }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

const ICON = {
  open: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  share: ["M12 3v12", "M7 8l5-5 5 5", "M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"],
  sound: ["M4 9v6h4l5 4V5L8 9H4z", "M16.5 8.5a5 5 0 0 1 0 7", "M19 6a8.5 8.5 0 0 1 0 12"],
  muted: ["M4 9v6h4l5 4V5L8 9H4z", "M17 9l5 5", "M22 9l-5 5"],
  settings: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  ],
  admin: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z", "M9 12l2 2 4-4"],
};

// 右側のボタン(推しのアイコン・開く・共有・ミュート・設定・管理)
function SideActions({ oshi, url, title }: { oshi: Oshi; url: string; title: string }) {
  const { muted, toggleMute, activated, isAdmin } = useContext(Controls);
  // 音の状態はボタンの色で示す: 音あり=白っぽい / ミュート中=ピンク / まだ音を出せない=黄色(押すと音が出る)
  const blocked = !muted && !activated;
  const soundTone = muted ? "bg-[#ff2d6f] text-white" : blocked ? "bg-[#ffc531] text-black animate-pulse" : "bg-white/15";
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // 共有をやめた場合は何もしない
    }
  };
  const round = "flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur";
  const item = "flex flex-col items-center gap-1";
  return (
    <div className="absolute right-3 bottom-8 z-10 flex flex-col items-center gap-4 text-[10.5px] font-bold [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
      <OshiAvatar oshi={oshi} size={46} />
      <a href={url} target="_blank" rel="noopener noreferrer" className={item}>
        <span className={round}>
          <Icon d={ICON.open} />
        </span>
        開く
      </a>
      <button type="button" onClick={share} className={item}>
        <span className={round}>
          <Icon d={ICON.share} />
        </span>
        {copied ? "コピー済み" : "共有"}
      </button>
      <button
        type="button"
        onClick={toggleMute}
        className={item}
        aria-pressed={muted}
        aria-label={muted ? "ミュート中(押すと音が出ます)" : blocked ? "音を出す" : "ミュートする"}
      >
        <span className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur ${soundTone}`}>
          <Icon d={muted || blocked ? ICON.muted : ICON.sound} />
        </span>
        {muted ? "ミュート中" : blocked ? "音を出す" : "音あり"}
      </button>
      <Link href="/app/settings" className={item}>
        <span className={round}>
          <Icon d={ICON.settings} />
        </span>
        設定
      </Link>
      {isAdmin ? (
        <Link href="/admin" className={item}>
          <span className={round}>
            <Icon d={ICON.admin} />
          </span>
          管理
        </Link>
      ) : null}
    </div>
  );
}

function Info({ platform, oshi, from, time, title, isNew }: {
  platform: string; oshi: Oshi; from: string; time: string; title?: string; isNew: boolean;
}) {
  const label = fromLabel(from);
  return (
    <div className="pointer-events-none absolute right-20 bottom-6 left-4 z-10 [text-shadow:0_1px_4px_rgba(0,0,0,.7)]">
      <span className="inline-flex h-6 items-center rounded-md bg-white/20 px-2 text-[11px] font-extrabold backdrop-blur">
        {platform}
      </span>
      <p className="mt-2 flex items-center gap-2 text-base font-black">
        <span className="truncate">{oshi.name}</span>
        {time ? <span className="shrink-0 text-xs font-bold text-white/75">・{time}</span> : null}
      </p>
      {label ? <p className="mt-0.5 truncate text-xs font-bold text-white/80">{label}</p> : null}
      {title ? (
        <p className="mt-1.5 line-clamp-3 text-[14px] leading-6 font-medium">
          {title}
          {isNew ? (
            <span className="ml-2 inline-block rounded bg-[#ff2d6f] px-1.5 align-[2px] text-[10px] font-black">新着</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

// 動画・記事の1枚
function ItemSlide({ item, from, oshi, live, near, muted, onToggleSound }: {
  item: TimelineItem; from: string; oshi: Oshi; live: boolean; near: boolean; muted: boolean; onToggleSound: () => void;
}) {
  const title = decodeEntities(item.title);
  const isNew = item.published_at > oshi.last_seen_at;
  const time = formatRelative(item.published_at);
  const videoId = item.platform === "youtube" ? youtubeVideoId(item.url) : null;
  const short = isYoutubeShort(item.url);
  const frame = useRef<HTMLIFrameElement>(null);

  const { activated, activate } = useContext(Controls);
  const send = useCallback((func: string) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
  }, []);

  // 音のオン・オフは YouTube の埋め込みに命令を送って切り替える(画面に出ている1件だけ)。
  // 自動再生を確実に始めるため音なしで読み込み、すぐに音をオンにする
  useEffect(() => {
    if (!live || !frame.current) return;
    send(muted ? "mute" : "unMute");
  }, [muted, live, send, activated]);

  const tap = () => {
    if (!muted && !activated) {
      // 初めて触ったとき: 音をオンにする(このタップで音を出せるようになる)
      activate();
      send("unMute");
      return;
    }
    onToggleSound();
  };

  // 字幕は出さない(動画の設定で字幕が自動で出るものも、読み込み後に字幕を外す)
  const hideCaptions = () => {
    const target = frame.current?.contentWindow;
    if (!target) return;
    for (const name of ["captions", "cc"]) {
      target.postMessage(JSON.stringify({ event: "command", func: "unloadModule", args: [name] }), "*");
    }
  };

  if (!videoId) {
    // 記事(Blog): 見出しのカードを出す。本文は保存しないので、続きは元のサイトで読む
    return (
      <>
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(120% 80% at 30% 20%, ${oshi.color}aa, #000 75%)` }}
        />
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-x-0 top-16 bottom-0 z-[6] flex flex-col justify-center px-6 pr-20 pb-44"
        >
          <p className="truncate text-xs font-extrabold tracking-wide text-white/80">BLOG ・ {hostOf(item.url)}</p>
          <p className="mt-4 line-clamp-[8] text-[26px] leading-[1.45] font-black [text-shadow:0_2px_12px_rgba(0,0,0,.35)]">{title}</p>
        </a>
        <SideActions oshi={oshi} url={item.url} title={title} />
        <Info platform="Blog" oshi={oshi} from={from} time={time} isNew={isNew} />
      </>
    );
  }

  const thumb = item.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const src =
    `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` +
    `&loop=1&playlist=${videoId}&enablejsapi=1&cc_load_policy=0&iv_load_policy=3`;
  return (
    <>
      {/* 背景: サムネイルをぼかして敷く */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
      <div className={short ? "absolute inset-0 flex items-center justify-center" : "absolute inset-x-0 top-1/2 -translate-y-[58%]"}>
        <div className={short ? "relative aspect-[9/16] h-full max-w-full" : "relative aspect-video w-full"}>
          {near ? (
            live ? (
              <iframe
                ref={frame}
                title={title}
                src={src}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                onLoad={() => {
                  // 読み込み直後は命令を受け付けないことがあるため、少し間をおいて音の設定を送り直す
                  for (const wait of [300, 1200]) setTimeout(() => send(muted ? "mute" : "unMute"), wait);
                  // 再生が始まってから字幕が読み込まれることがあるため、少し間をおいてもう一度外す
                  hideCaptions();
                  setTimeout(hideCaptions, 1500);
                  setTimeout(hideCaptions, 4000);
                }}
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
            )
          ) : null}
        </div>
      </div>
      {/* 動画の上の透明な層: 上下のスワイプを受け取り、タップで音を切り替える */}
      <button
        type="button"
        aria-label={muted || !activated ? "音を出す" : "音を消す"}
        onClick={tap}
        className="absolute inset-0 z-[5] cursor-pointer"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
      <SideActions oshi={oshi} url={item.url} title={title} />
      <Info platform={short ? "YouTube ショート" : "YouTube"} oshi={oshi} from={from} time={time} title={title} isNew={isNew} />
    </>
  );
}

// X・Instagram・TikTok の1枚。画面に出ている間だけ公式の埋め込みを読み込む
function EmbedSlide({ source, from, oshi, live }: { source: Source; from: string; oshi: Oshi; live: boolean }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 70% 10%, ${oshi.color}88, #000 70%)` }} />
      <div className="absolute inset-x-0 top-16 bottom-0 overflow-hidden bg-white text-black">
        {live ? (
          <EmbedCard source={source} oshiName={oshi.name} fill autoLoad />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-black/50">{PLATFORM_LABEL[source.platform]}</div>
        )}
      </div>
      <SideActions oshi={oshi} url={source.url} title={`${oshi.name}の${PLATFORM_LABEL[source.platform]}`} />
      <Info
        platform={PLATFORM_LABEL[source.platform]}
        oshi={oshi}
        from={from}
        time=""
        title={
          source.platform === "instagram"
            ? `Instagram ${source.handle}(投稿を1件ずつ読み込めなかったため、アカウントを表示しています)`
            : source.handle
              ? `${PLATFORM_LABEL[source.platform]} ${source.handle} の最新の投稿`
              : undefined
        }
        isNew={false}
      />
    </>
  );
}

// Instagram の投稿1件。写真を画面いっぱいに出す(いいね・コメント欄などは出さない)。
// 写真のURLを読めなかったときだけ、Instagram 公式の投稿埋め込みを出す。前後1枚まで先に読み込む
function InstaSlide({ source, code, from, oshi, near }: { source: Source; code: string; from: string; oshi: Oshi; near: boolean }) {
  const url = `https://www.instagram.com/p/${code}/`;
  const [media, setMedia] = useState<{ image: string | null; video: boolean } | null>(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!near || media) return;
    let cancelled = false;
    fetch(`/api/instagram-media?code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : { image: null, video: false }))
      .then((m: { image: string | null; video: boolean }) => {
        if (!cancelled) setMedia(m);
      })
      .catch(() => {
        if (!cancelled) setMedia({ image: null, video: false });
      });
    return () => {
      cancelled = true;
    };
  }, [near, media, code]);

  const image = media?.image && !broken ? media.image : null;
  return (
    <>
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={`${oshi.name}のInstagramの投稿`}
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="absolute inset-x-0 top-16 bottom-0 h-[calc(100%-4rem)] w-full object-contain"
          />
          {media?.video ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagramで動画を見る"
              className="absolute top-1/2 left-1/2 z-[6] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-2xl backdrop-blur"
            >
              ▶
            </a>
          ) : null}
        </>
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 70% 10%, ${oshi.color}88, #000 70%)` }} />
          <div className="absolute inset-x-0 top-16 bottom-0 overflow-hidden bg-white">
            {near && media ? (
              <InstagramPost code={code} title={`${oshi.name}のInstagramの投稿`} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-black/50">Instagram</div>
            )}
          </div>
        </>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
      <SideActions oshi={oshi} url={url} title={`${oshi.name}のInstagramの投稿`} />
      <Info platform="Instagram" oshi={oshi} from={from} time="" title={source.handle ? `Instagram ${source.handle}` : undefined} isNew={false} />
    </>
  );
}

// X の投稿1件。前後1枚まで先に読み込んでおく
function TweetSlide({ source, id, at, from, oshi, near }: {
  source: Source; id: string; at: string; from: string; oshi: Oshi; near: boolean;
}) {
  const handle = source.handle.replace(/^@/, "");
  const url = `https://x.com/${handle}/status/${id}`;
  return (
    <>
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 70% 10%, ${oshi.color}88, #000 70%)` }} />
      <div className="absolute inset-x-0 top-16 bottom-0 overflow-hidden bg-black pb-40">
        {near ? <XPostEmbed id={id} url={url} theme="dark" /> : <div className="flex h-full items-center justify-center text-sm text-white/50">X</div>}
      </div>
      {/* 投稿の上の透明な層: 上下のスワイプを受け取る(開くのは右の「開く」から) */}
      <div className="absolute inset-0 z-[5]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black to-transparent" />
      <SideActions oshi={oshi} url={url} title={`${oshi.name}のXの投稿`} />
      <Info platform="X" oshi={oshi} from={from} time={formatRelative(at)} title={`X @${handle}`} isNew={at > oshi.last_seen_at} />
    </>
  );
}

// TikTok の動画1本。TikTok 公式の動画プレーヤーを全画面で出す。画面に出ている1本だけ読み込み、自動で再生する。
// タップで音のオン・オフ(プレーヤーに命令を送る)
function TikTokSlide({ source, id, at, from, oshi, live, muted, onToggleSound }: {
  source: Source; id: string; at: string | null; from: string; oshi: Oshi; live: boolean; muted: boolean; onToggleSound: () => void;
}) {
  const handle = source.handle.replace(/^@/, "");
  const url = `https://www.tiktok.com/@${handle}/video/${id}`;
  const frame = useRef<HTMLIFrameElement>(null);
  const send = useCallback((type: string) => {
    frame.current?.contentWindow?.postMessage({ "x-tiktok-player": true, type }, "*");
  }, []);
  const { activated } = useContext(Controls);
  // 画面を初めて触ったときにも音の設定を送り直す(それまではブラウザの制限で音を出せない)
  useEffect(() => {
    if (live) send(muted ? "mute" : "unMute");
  }, [muted, live, send, activated]);

  // ループはプレーヤーの機能に任せると読み直しで途切れるため、終わったらすぐ先頭に戻して再生する
  useEffect(() => {
    if (!live) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = (typeof event.data === "string" ? safeJson(event.data) : event.data) as
        | { "x-tiktok-player"?: boolean; type?: string; value?: number }
        | null;
      if (!data || !data["x-tiktok-player"]) return;
      if (data.type === "onStateChange" && data.value === 0) {
        frame.current?.contentWindow?.postMessage({ "x-tiktok-player": true, type: "seekTo", value: 0 }, "*");
        frame.current?.contentWindow?.postMessage({ "x-tiktok-player": true, type: "play" }, "*");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [live]);
  const src =
    `https://www.tiktok.com/player/v1/${id}?autoplay=1&loop=0&music_info=0&description=0&rel=0` +
    `&controls=1&progress_bar=1&play_button=0&volume_control=0&fullscreen_button=0&timestamp=0` +
    `&native_context_menu=0&closed_caption=0`;
  return (
    <>
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 50% 20%, ${oshi.color}66, #000 70%)` }} />
      <div className="absolute inset-x-0 top-16 bottom-0 flex items-center justify-center">
        <div className="relative aspect-[9/16] h-full max-w-full">
          {live ? (
            <iframe
              ref={frame}
              title={`${oshi.name}のTikTok`}
              src={src}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => {
                for (const wait of [300, 1200]) setTimeout(() => send(muted ? "mute" : "unMute"), wait);
              }}
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : null}
        </div>
      </div>
      {/* 動画の上の透明な層: 上下のスワイプを受け取り、タップで音を切り替える */}
      <button type="button" aria-label={muted ? "音を出す" : "音を消す"} onClick={onToggleSound} className="absolute inset-0 z-[5] cursor-pointer" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
      <SideActions oshi={oshi} url={url} title={`${oshi.name}のTikTok`} />
      <Info platform="TikTok" oshi={oshi} from={from} time={at ? formatRelative(at) : ""} title={`TikTok @${handle}`} isNew={at ? at > oshi.last_seen_at : false} />
    </>
  );
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
