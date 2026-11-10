"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  oshi: Oshi[];
  active: Oshi;
  unread: Record<string, number>;
  sources: Source[];
  // Instagram のアカウントごとの最新の投稿のコード(読めなかったアカウントは空)
  instagram: Record<string, string[]>;
  // X のアカウントごとの最新の投稿(番号と日時。読めなかったアカウントは空)
  x: Record<string, { id: string; at: string }[]>;
  items: TimelineItem[];
  pageSize: number;
};

const EMBED_PLATFORMS: Platform[] = ["x", "instagram", "tiktok"];
// 新着(動画・記事)何件ごとに、X・Instagram・TikTok の画面を1枚はさむか
const EMBED_EVERY = 3;

type Slide =
  | { kind: "item"; key: string; item: TimelineItem; from: string }
  | { kind: "embed"; key: string; source: Source; from: string }
  | { kind: "insta"; key: string; source: Source; from: string; code: string }
  | { kind: "tweet"; key: string; source: Source; from: string; id: string; at: string };

const normalizeUrl = (url: string) => url.toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/+$/, "");

export function SwipeFeed({ oshi, active, unread, sources, instagram, x, items: initialItems, pageSize }: Props) {
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
    const cards = dated.sort((a, b) => (a.at < b.at ? 1 : -1)).map((d) => d.slide);
    // Instagram は投稿1件ずつ(読めたとき)。X・TikTok と、投稿を読めなかった Instagram はアカウントの表示
    const embeds: Slide[] = [];
    for (const source of sources.filter((s) => EMBED_PLATFORMS.includes(s.platform))) {
      const from = fromOf.get(source.id) ?? "";
      const codes = source.platform === "instagram" ? (instagram[source.id] ?? []) : [];
      // 投稿を読めた X は、上で日時の順に混ぜてあるのでアカウントの表示は出さない
      if (source.platform === "x" && (x[source.id] ?? []).length > 0) continue;
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
  }, [items, sources, fromOf, instagram, x]);

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

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-40 bg-black text-white md:top-14 md:bottom-0 md:z-20"
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
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        aria-label="更新"
        className="absolute top-3 right-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-lg backdrop-blur"
      >
        <span className={refreshing ? "animate-spin" : ""}>↻</span>
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
  );
}

function fromLabel(from: string): string {
  return from && from !== "本人" ? `${from} の投稿` : "";
}

// 右側のボタン(推しのアイコン・開く・共有)
function SideActions({ oshi, url, title }: { oshi: Oshi; url: string; title: string }) {
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
  const round = "flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-xl backdrop-blur";
  return (
    <div className="absolute right-3 bottom-28 z-10 flex flex-col items-center gap-5 text-[11px] font-bold [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
      <OshiAvatar oshi={oshi} size={48} />
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1">
        <span className={round}>↗</span>
        開く
      </a>
      <button type="button" onClick={share} className="flex flex-col items-center gap-1">
        <span className={round}>⤴</span>
        {copied ? "コピー済み" : "共有"}
      </button>
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

  // ブラウザは、画面を一度も触っていないうちは自動再生で音を出させない。触ったかどうかを見て案内を変える
  const [activated, setActivated] = useState(() =>
    typeof navigator === "undefined" ? true : (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true,
  );
  const send = useCallback((func: string) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
  }, []);

  // 音のオン・オフは YouTube の埋め込みに命令を送って切り替える(画面に出ている1件だけ)。
  // 自動再生を確実に始めるため音なしで読み込み、すぐに音をオンにする
  useEffect(() => {
    if (!live || !frame.current) return;
    send(muted ? "mute" : "unMute");
  }, [muted, live, send]);

  const tap = () => {
    if (!muted && !activated) {
      // 初めて触ったとき: 音をオンにする(このタップで音を出せるようになる)
      setActivated(true);
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
          className="absolute inset-x-4 top-24 right-20 z-[6] block rounded-2xl bg-[#fffdf8] p-6 text-[#2b2420] shadow-2xl"
        >
          <p className="truncate text-[11px] font-extrabold tracking-wide" style={{ color: oshi.color }}>
            BLOG ・ {hostOf(item.url)}
          </p>
          <p className="mt-3 line-clamp-6 text-xl leading-8 font-black">{title}</p>
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
      {live ? (
        <span className="pointer-events-none absolute top-20 left-4 z-10 rounded-full bg-black/55 px-3 py-1 text-xs font-bold backdrop-blur">
          {muted ? "🔇 音なし(タップで音を出す)" : activated ? "🔊 音あり" : "🔇 タップで音を出す"}
        </span>
      ) : null}
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
      <div className="absolute inset-x-3 top-20 right-20 bottom-36 overflow-hidden rounded-2xl bg-white text-black">
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
            className="absolute inset-x-0 top-16 bottom-28 m-auto max-h-[calc(100%-11rem)] w-full object-contain"
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
          <div className="absolute inset-x-3 top-20 right-20 bottom-32 overflow-hidden rounded-2xl bg-white">
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
      <div className="absolute inset-x-3 top-20 right-20 bottom-32 overflow-hidden rounded-2xl bg-white">
        {near ? <XPostEmbed id={id} url={url} /> : <div className="flex h-full items-center justify-center text-sm text-black/50">X</div>}
      </div>
      <SideActions oshi={oshi} url={url} title={`${oshi.name}のXの投稿`} />
      <Info platform="X" oshi={oshi} from={from} time={formatRelative(at)} title={`X @${handle}`} isNew={at > oshi.last_seen_at} />
    </>
  );
}
