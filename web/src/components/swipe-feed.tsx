"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition,
} from "react";
import { EmbedCard, InstagramPost, XPostEmbed } from "@/components/embeds";
import { CalendarBody, GalleryBody } from "@/components/memories";
import { OshiAvatar } from "@/components/oshi-avatar";
import { formatRelative } from "@/components/ui";
import { loadMore, markSeen } from "@/lib/actions/oshi";
import { toggleFeedMode } from "@/lib/actions/mode";
import { importAllSns } from "@/lib/actions/sources";
import { isYoutubeShort, PLATFORM_LABEL, youtubeVideoId } from "@/lib/platforms";
import { buzz } from "@/lib/haptic";
import { useLongPress } from "@/lib/long-press";
import { decodeEntities, hostOf } from "@/lib/text";
import type { CalendarEntry, GalleryPhoto, Oshi, Platform, Source, TimelineItem } from "@/lib/types";

// TikTok 風の新着。推しを1人選び、その推しと所属グループの新着(動画・記事・X・Instagram・TikTok)を
// 1本の流れにして、上下のスワイプで1件ずつ見る。
// 左右のスワイプで画面を切り替える: [カレンダー] ← 右へスワイプ ― [新着(SNS)] ― 左へスワイプ → [ギャラリー]
// 画面に出ている1件だけを読み込み・再生し(音なしで自動再生)、ほかは静止画にして軽くする。

type Props = {
  isAdmin: boolean;
  // 通常 / Sensitive のどちらの推しを見ているか。canSensitive: 切り替えられるプランか
  mode: "normal" | "sensitive";
  canSensitive: boolean;
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
  // 今のアプリの登録(本人・グループ)のうち、まだ新着の取得先に取り込んでいないSNSの数
  pendingSns: number;
  // 最初に開く画面(新着・ギャラリー・カレンダー)と、その中身。3つともまとめて読んでおき、左右のスワイプはその場で切り替える
  view: FeedView;
  gallery: GalleryPhoto[];
  calendar: CalendarEntry[];
};

export type FeedView = "feed" | "gallery" | "calendar";
// 画面の並び(左から)。右へスワイプすると左の画面へ、左へスワイプすると右の画面へ移る
const VIEWS: FeedView[] = ["calendar", "feed", "gallery"];

function tabHref(id: string, view: FeedView): string {
  return `/app?tab=${encodeURIComponent(id)}${view === "feed" ? "" : `&view=${view}`}`;
}

const EMBED_PLATFORMS: Platform[] = ["x", "instagram", "tiktok"];
// 中身を読み込めない(読み込まない)サービス: 推しのページへ移るカードを1枚はさむ
const LINK_PLATFORMS: Platform[] = ["threads", "fantia", "myfans", "xfans"];

// 縦長の動画(ショート・TikTok)の枠。画面に収まる中でいちばん大きく出す(見切れないよう、はみ出させない)
const VERTICAL_FRAME = {
  aspectRatio: "9 / 16",
  height: "min(100%, calc(100vw * 16 / 9))",
  maxWidth: "100%",
} as const;
// 新着(動画・記事)何件ごとに、X・Instagram・TikTok の画面を1枚はさむか
const EMBED_EVERY = 3;

// 上の並びは「いちばん左の推し」を再生する。ほかのアイコンをタップすると、そのアイコンが左端まで動いて切り替わる
function OshiTab({ oshi: o, view, on, count, busy, onRefresh, onSelect, tabRef }: {
  oshi: Oshi; view: FeedView; on: boolean; count: number; busy: boolean; onRefresh?: () => void; onSelect: () => void;
  tabRef?: React.Ref<HTMLAnchorElement>;
}) {
  // 長押し: その推しのメニュー(推し情報の更新・新規登録)。右下の推しのアイコンと同じもの
  const [menu, setMenu] = useState(false);
  const press = useLongPress(() => setMenu(true));
  return (
    <>
    <Link
      href={tabHref(o.id, view)}
      replace
      ref={tabRef}
      aria-current={on ? "page" : undefined}
      aria-label={`${o.name}(タップで新着を取りに行く・長押しでメニュー)`}
      title={o.name}
      className={`relative flex shrink-0 snap-start items-center justify-center rounded-full ${on ? "" : "opacity-55"}`}
      {...press}
      // 選んでいる推しをもう一度タップしたときは、その推しの新着を取りに行く
      onClick={(event) => {
        event.preventDefault();
        if (onRefresh) onRefresh();
        else onSelect();
      }}
      style={{ ...press.style, width: "var(--slot)", height: "var(--slot)" }}
    >
      <OshiAvatar oshi={o} size="var(--avatar)" />
      {busy ? (
        <span
          aria-hidden
          className="absolute animate-spin rounded-full border-2 border-white/25 border-t-white"
          style={{ width: "calc(var(--avatar) + 10px)", height: "calc(var(--avatar) + 10px)" }}
        />
      ) : null}
      {on ? <span className="absolute bottom-0 h-[3px] w-5 rounded-full bg-white" aria-hidden /> : null}
      {count > 0 ? (
        <span className="num absolute top-0.5 right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff2d6f] px-1 text-[10px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
    {menu ? createPortal(<OshiMenu oshi={o} onClose={() => setMenu(false)} />, document.body) : null}
    </>
  );
}

function readActivation(): boolean {
  return (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true;
}
function subscribeActivation(notify: () => void): () => void {
  window.addEventListener("pointerdown", notify, true);
  window.addEventListener("keydown", notify, true);
  return () => {
    window.removeEventListener("pointerdown", notify, true);
    window.removeEventListener("keydown", notify, true);
  };
}

// 右側のボタン(ミュート・設定・管理)が使う共通の状態
// activated: 画面をもう触ったか。ブラウザは、一度も触っていないうちは自動再生で音を出させない
const Controls = createContext<{
  muted: boolean; toggleMute: () => boolean; activated: boolean; activate: () => void; isAdmin: boolean;
  mode: "normal" | "sensitive"; canSensitive: boolean;
}>({
  muted: false,
  toggleMute: () => false,
  activated: true,
  activate: () => {},
  isAdmin: false,
  mode: "normal",
  canSensitive: false,
});

type Slide =
  | { kind: "item"; key: string; item: TimelineItem; from: string }
  | { kind: "embed"; key: string; source: Source; from: string }
  | { kind: "insta"; key: string; source: Source; from: string; code: string }
  | { kind: "tweet"; key: string; source: Source; from: string; id: string; at: string }
  | { kind: "tiktok"; key: string; source: Source; from: string; id: string; at: string | null }
  | { kind: "link"; key: string; source: Source; from: string };

const normalizeUrl = (url: string) => url.toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/+$/, "");

export function SwipeFeed({
  isAdmin, mode, canSensitive, oshi, active, unread, sources, instagram, x, tiktok, items: initialItems, pageSize, pendingSns, view: initialView, gallery, calendar,
}: Props) {
  const [view, setView] = useState<FeedView>(initialView);
  // 切り替えた向き(画面を横から滑り込ませる向き)
  const [enter, setEnter] = useState<"left" | "right" | null>(null);
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

  // 今のアプリの登録(本人・グループ)で、まだ取り込んでいないSNSがあれば、裏で自動で取り込む(このタブで1回)
  useEffect(() => {
    if (pendingSns === 0) return;
    const key = "oshi-sns-auto-import-feed";
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // 保存できない環境でもそのまま取り込む
    }
    void importAllSns().then((result) => {
      if (result.ok && result.data && result.data.added + result.data.linked > 0) router.refresh();
    });
  }, [pendingSns, router]);
  const activeTab = useRef<HTMLAnchorElement>(null);
  const tabs = useRef<HTMLElement>(null);

  // 上の並びは切れ目なくループさせる: 推しの並びを何周か続けて置き、真ん中の周の「再生中の推し」を左端にする。
  // 推しを切り替えると画面が作り直され、また真ん中の周から始まるので、どちらへ動かしても端に着かない
  const n = oshi.length;
  const laps = n <= 1 ? 1 : Math.max(3, Math.ceil(15 / n));
  const activeIndex = Math.max(0, oshi.findIndex((o) => o.id === active.id));
  const home = Math.floor(laps / 2) * n + activeIndex;
  const strip = useMemo(() => Array.from({ length: n * laps }, (_, i) => oshi[i % n]), [oshi, n, laps]);

  // 再生中の推しを、上の並びのいちばん左に置く
  useEffect(() => {
    const nav = tabs.current;
    const tab = activeTab.current;
    if (nav && tab) nav.scrollLeft = tab.offsetLeft;
  }, [active.id]);

  // 上の並び: 動かしている間も、いちばん左に来た推しをすぐ選んだ表示にし(軽く振動)、
  // 動きが止まったらその推しに切り替える(切り替えた推しは開いたときに新着を取りに行く)。
  // 切り替えの読み込み中は、そのアイコンにくるくるを出す
  const [leftIndex, setLeftIndex] = useState(home);
  const [switching, startSwitch] = useTransition();
  const target = useRef(active.id);
  const switchTo = useCallback(
    (id: string) => {
      if (id === target.current) return;
      target.current = id;
      startSwitch(() => router.replace(tabHref(id, view), { scroll: false }));
    },
    [router, view],
  );
  useEffect(() => {
    const nav = tabs.current;
    if (!nav) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = home;
    const leftmost = () => {
      const slot = (nav.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
      if (slot === 0) return null;
      return Math.min(strip.length - 1, Math.max(0, Math.round(nav.scrollLeft / slot)));
    };
    const settle = () => {
      clearTimeout(timer);
      const index = leftmost();
      if (index !== null) switchTo(strip[index].id);
    };
    const onScroll = () => {
      const index = leftmost();
      if (index !== null && index !== last) {
        last = index;
        setLeftIndex(index);
        buzz(8);
      }
      // scrollend に対応していないブラウザでは、動きが止まってから少し待って切り替える
      clearTimeout(timer);
      timer = setTimeout(settle, 120);
    };
    nav.addEventListener("scroll", onScroll, { passive: true });
    nav.addEventListener("scrollend", settle);
    return () => {
      clearTimeout(timer);
      nav.removeEventListener("scroll", onScroll);
      nav.removeEventListener("scrollend", settle);
    };
  }, [strip, home, switchTo]);

  // アイコンのタップ: すぐに切り替えを始め、並びはそのアイコンが左端に来るまで動かす
  const selectTab = useCallback(
    (index: number) => {
      const nav = tabs.current;
      const tab = nav?.children[index] as HTMLElement | undefined;
      setLeftIndex(index);
      switchTo(strip[index].id);
      if (nav && tab) nav.scrollTo({ left: tab.offsetLeft, behavior: "smooth" });
    },
    [strip, switchTo],
  );

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
    // Threads・Fantia・myfans・xfans は、推しのページへ移るカードとして最後に並べる
    for (const source of sources.filter((s) => LINK_PLATFORMS.includes(s.platform))) {
      result.push({ kind: "link", key: `l-${source.id}`, source, from: fromOf.get(source.id) ?? "" });
    }
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

  // 左右のスワイプで画面を切り替える(カレンダー ← 新着 → ギャラリー)。推しの切り替えは上のアイコンで行う。
  // 3つの画面の中身は読み込み済みなので、サーバーを待たずにその場で切り替え、URLだけ書き換える
  const go = useCallback(
    (step: number) => {
      const next = VIEWS[VIEWS.indexOf(view) + step];
      if (!next) return;
      buzz(15);
      setEnter(step > 0 ? "right" : "left");
      setView(next);
      window.history.replaceState(window.history.state, "", tabHref(active.id, next));
    },
    [view, active.id],
  );
  const touch = useRef<{ x: number; y: number; at: number } | null>(null);

  // 推しのアイコンをタップしたら(=この画面が開いたら)、その推しの新着を取りに行く。
  // 新しく届いたものがあれば画面を読み直す。取得元ごとに10分は取り直さない(サーバー側)
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch("/api/feeds/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oshiId: active.id }),
      });
      const body = (await response.json().catch(() => ({}))) as { claimed?: number; added?: number };
      if (response.ok && body.added) {
        setNote(`新着が${body.added}件ありました`);
        setTimeout(() => setNote(null), 3000);
        router.refresh();
      }
    } catch {
      // 通信できないときは、今ある新着をそのまま見せる
    } finally {
      setRefreshing(false);
    }
  }, [active.id, router]);
  useEffect(() => {
    // 画面を描き終えてから取りに行く(新着の画面のときだけ)
    if (view !== "feed") return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh, view]);

  // ブラウザが音を出させてくれる状態か(画面を一度でも触ったか)。サーバーで作る画面では「触った」とみなし、
  // ブラウザで実際の状態に合わせる(表示のずれを起こさないため useSyncExternalStore を使う)
  const browserActivated = useSyncExternalStore(subscribeActivation, readActivation, () => false);
  const [touched, setActivated] = useState(false);
  const activated = browserActivated || touched;
  // 起動してから初めて画面に触れた時刻。そのタップ(動画・ミュートボタン)は「音を出す」として扱う
  // (触れた瞬間に「触った」状態になるため、そのままだと最初のタップで逆にミュートになってしまう)
  const firstTouchAt = useRef(0);
  const controls = useMemo(
    () => ({
      muted,
      // 音のオン・オフを切り替え、切り替えたあとに音が出るか(true)を返す
      toggleMute: () => {
        if (!activated || Date.now() - firstTouchAt.current < 1500) {
          firstTouchAt.current = 0;
          setActivated(true);
          setMuted(false);
          return true;
        }
        setMuted(!muted);
        return muted;
      },
      activated,
      activate: () => setActivated(true),
      isAdmin,
      mode,
      canSensitive,
    }),
    [muted, activated, isAdmin, mode, canSensitive],
  );

  return (
    <Controls.Provider value={controls}>
    <div
      className="fixed inset-0 z-40 bg-black text-white md:top-14 md:z-20"
      // 上部は推しのアイコン5つが画面の幅に並ぶ大きさにする
      style={{
        ["--slot" as string]: "min(80px, calc((100vw - 8px) / 5))",
        ["--avatar" as string]: "calc(var(--slot) - 12px)",
        // 上部の高さ(この下から写真・投稿を出す)
        ["--bar" as string]: "calc(var(--slot) + 8px + env(safe-area-inset-top))",
      }}
      onPointerDown={() => {
        if (!activated) {
          firstTouchAt.current = Date.now();
          setActivated(true);
        }
      }}
      // ボタン・リンク(推しのアイコン・更新・開く・共有・ミュート・設定・管理、動画のタップ)を押したら軽く振動させる
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("a, button")) buzz();
      }}
      onTouchStart={(event) => {
        // 上の推しのアイコンの並びを動かすときは、画面の切り替えにしない
        if ((event.target as HTMLElement).closest("nav")) {
          touch.current = null;
          return;
        }
        const t = event.touches[0];
        touch.current = { x: t.clientX, y: t.clientY, at: Date.now() };
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = event.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        // 横に50px以上、またはすばやく払ったとき(0.25秒以内に30px以上)に切り替える。縦の動きが大きいときは切り替えない
        const quick = Date.now() - start.at < 250 && Math.abs(dx) > 30;
        if ((Math.abs(dx) > 50 || quick) && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      }}
    >
      {/* 上: 推しのアイコン(いちばん左の推しを再生。動かして左端に来た推しに切り替えて新着を取りに行く。長押しでSNSの登録) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[calc(var(--bar)+2rem)] bg-gradient-to-b from-black/70 to-transparent" />
      <nav
        ref={tabs}
        aria-label="推し"
        aria-busy={refreshing}
        className="absolute top-[env(safe-area-inset-top)] z-30 flex h-[calc(var(--slot)+8px)] snap-x snap-mandatory items-center overflow-x-auto [scrollbar-width:none]"
        style={{ width: "calc(var(--slot) * 5)", left: "calc((100vw - var(--slot) * 5) / 2)" }}
      >
        {strip.map((o, i) => {
          const on = i === leftIndex;
          const count = unread[o.id] ?? 0;
          return (
            <OshiTab
              key={`${o.id}-${i}`}
              oshi={o}
              view={view}
              on={on}
              count={count}
              busy={on && (refreshing || switching)}
              onRefresh={i === home ? () => void refresh() : undefined}
              onSelect={() => selectTab(i)}
              tabRef={i === home ? activeTab : undefined}
            />
          );
        })}
      </nav>
      {note ? (
        <p className="absolute top-[var(--bar)] left-1/2 z-30 -translate-x-1/2 rounded-full bg-white px-4 py-1.5 text-[13px] font-bold whitespace-nowrap text-black">
          {note}
        </p>
      ) : null}

      {/* ギャラリー・カレンダー: 新着の上に重ねて出す(新着は裏で止めておき、戻ったときに同じ位置から見られる)。
          切り替えた画面は横から滑り込ませる */}
      {view !== "feed" ? (
        <div
          key={view}
          className="absolute inset-0 z-10 bg-black"
          style={enter ? { animation: `view-enter-${enter} 180ms ease-out` } : undefined}
        >
          {view === "gallery" ? (
            <GalleryBody key={`g-${active.id}`} oshi={active} photos={gallery} />
          ) : (
            <CalendarBody key={`c-${active.id}`} oshi={active} entries={calendar} onShowGallery={() => go(2)} />
          )}
        </div>
      ) : null}

      <div
        className={`absolute inset-0 ${view === "feed" ? "" : "invisible"}`}
        style={view === "feed" && enter ? { animation: `view-enter-${enter} 180ms ease-out` } : undefined}
      >
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
                  live={i === current && view === "feed"}
                  near={Math.abs(i - current) <= 1}
                  muted={muted}
                  onToggleSound={controls.toggleMute}
                />
              ) : slide.kind === "tiktok" ? (
                <TikTokSlide
                  source={slide.source}
                  id={slide.id}
                  at={slide.at}
                  from={slide.from}
                  oshi={active}
                  live={i === current && view === "feed"}
                  muted={muted}
                  onToggleSound={controls.toggleMute}
                />
              ) : slide.kind === "tweet" ? (
                <TweetSlide
                  source={slide.source}
                  id={slide.id}
                  at={slide.at}
                  from={slide.from}
                  oshi={active}
                  near={Math.abs(i - current) <= 1}
                  live={i === current && view === "feed"}
                />
              ) : slide.kind === "link" ? (
                <LinkSlide source={slide.source} from={slide.from} oshi={active} />
              ) : slide.kind === "insta" ? (
                <InstaSlide source={slide.source} code={slide.code} from={slide.from} oshi={active} near={Math.abs(i - current) <= 1} />
              ) : (
                <EmbedSlide source={slide.source} from={slide.from} oshi={active} live={i === current && view === "feed"} />
              )}
            </section>
          ))}
          {pending ? (
            <div className="flex h-24 items-center justify-center text-sm text-white/60">読み込み中</div>
          ) : null}
        </div>
      )}
      </div>
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
  heart: ["M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z"],
  sound: ["M4 9v6h4l5 4V5L8 9H4z", "M16.5 8.5a5 5 0 0 1 0 7", "M19 6a8.5 8.5 0 0 1 0 12"],
  muted: ["M4 9v6h4l5 4V5L8 9H4z", "M17 9l5 5", "M22 9l-5 5"],
  settings: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  ],
  admin: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z", "M9 12l2 2 4-4"],
};

type SheetItem = { label: string; note?: string; href?: string; onSelect?: () => void };

// 下から出るメニュー(共有・反応など)。画面全体のいちばん上に出す
function Sheet({ title, items, onClose }: { title: string; items: SheetItem[]; onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60 text-white" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full rounded-t-3xl bg-[#111] px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl"
      >
        <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/25" />
        <p className="mb-3 px-1 text-[15px] font-bold">{title}</p>
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-white/5">
          {items.map((item) => (
            <li key={item.label}>
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="flex min-h-[56px] flex-col justify-center px-4 py-2 active:bg-white/10"
                >
                  <span className="text-[15px] font-semibold">{item.label}</span>
                  {item.note ? <span className="truncate text-xs text-white/55">{item.note}</span> : null}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    item.onSelect?.();
                    onClose();
                  }}
                  className="flex min-h-[56px] w-full flex-col justify-center px-4 py-2 text-left active:bg-white/10"
                >
                  <span className="text-[15px] font-semibold">{item.label}</span>
                  {item.note ? <span className="truncate text-xs text-white/55">{item.note}</span> : null}
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose} className="mt-3 h-12 w-full rounded-2xl bg-white/10 text-[15px] font-semibold">
          閉じる
        </button>
      </div>
    </div>,
    document.body,
  );
}

// 推しのメニュー(上の並びの推しのアイコン・右下の推しのアイコンの長押し)
function OshiMenu({ oshi, onClose }: { oshi: Oshi; onClose: () => void }) {
  const items: { href: string; label: string }[] = [
    { href: `/app/manage?edit=${encodeURIComponent(oshi.id)}`, label: "推し情報の更新" },
    { href: "/app/manage?new=1", label: "推し情報の新規登録" },
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60 text-white" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-label={`${oshi.name}のメニュー`}
        onClick={(event) => event.stopPropagation()}
        className="w-full rounded-t-3xl bg-[#111] px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-white shadow-2xl"
      >
        <span aria-hidden className="mx-auto mb-4 block h-1 w-10 rounded-full bg-white/25" />
        <div className="mb-3 flex items-center gap-3 px-1">
          <OshiAvatar oshi={oshi} size={44} />
          <p className="truncate text-lg font-bold">{oshi.name}</p>
        </div>
        <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl bg-white/5">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-[56px] items-center px-4 py-2 text-[15px] font-semibold active:bg-white/10">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onClose} className="mt-3 h-12 w-full rounded-2xl bg-white/10 text-[15px] font-semibold">
          閉じる
        </button>
      </div>
    </div>
  );
}

// 右側のボタン(推しのアイコン・開く・共有・ミュート・設定・管理)
// reactions: ❤ で出す反応(いいね・リポスト・コメントなど)。各SNSの公式の画面を開いて行う
function SideActions({ oshi, url, title, platform, reactions }: {
  oshi: Oshi; url: string; title: string; platform: string; reactions?: SheetItem[];
}) {
  const { muted, toggleMute, isAdmin, activated } = useContext(Controls);
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  // 右下の推しのアイコンを長押し: その推しのメニュー(推し情報の更新・新規登録)
  const avatarPress = useLongPress(() => setMenu(true));
  // 設定(管理)ボタンを長押し: 通常 ⇔ Sensitive の推しを切り替える(Sensitive プランだけ)
  const { mode, canSensitive } = useContext(Controls);
  const [modeNote, setModeNote] = useState<string | null>(null);
  const newPress = useLongPress(() => {
    if (!canSensitive) {
      setModeNote("Sensitive プランで使えます");
      setTimeout(() => setModeNote(null), 2000);
      return;
    }
    void toggleFeedMode().then((result) => {
      if (!result.ok || !result.data) return;
      setModeNote(result.data.mode === "sensitive" ? "Sensitive に切り替えました" : "通常に切り替えました");
      setTimeout(() => setModeNote(null), 2000);
      // 切り替えた一覧の最初の推しから見せる
      router.replace("/app");
      router.refresh();
    });
  });
  // 音の状態はボタンの色で示す: 音あり=白っぽい / ミュート中=ピンク。
  // 起動直後(まだ画面を触っていない)はブラウザの決まりで音を出せないので、ピンクで点滅させ「タップで音」と知らせる
  const waiting = !muted && !activated;
  const silent = muted || waiting;
  const soundTone = silent ? `bg-[#ff2d6f] text-white${waiting ? " animate-pulse" : ""}` : "bg-white/15";
  const [sheet, setSheet] = useState<"share" | "react" | null>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // コピーできない環境では何もしない
    }
  };
  const shareItems: SheetItem[] = [
    { label: `${platform}で開く`, note: url.replace(/^https?:\/\/(www\.)?/, ""), href: url },
    ...(typeof navigator !== "undefined" && "share" in navigator
      ? [{ label: "共有", note: "LINE・メッセージなどに送る", onSelect: () => void navigator.share({ title, url }).catch(() => {}) }]
      : []),
    { label: "リンクをコピー", onSelect: () => void copy() },
  ];
  const reactItems: SheetItem[] = reactions ?? [{ label: `${platform}でいいね・コメント`, note: "元の投稿を開きます", href: url }];
  const round = "flex h-11 w-11 items-center justify-center rounded-full bg-white/15 backdrop-blur";
  const item = "flex flex-col items-center gap-1";
  return (
    <div className="absolute right-3 bottom-[calc(2rem+env(safe-area-inset-bottom))] z-10 flex flex-col items-center gap-4 text-[10.5px] font-bold [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">
      <button
        type="button"
        aria-label={`${oshi.name}のメニュー(長押し)`}
        onClick={() => setMenu(true)}
        {...avatarPress}
        className="rounded-full"
      >
        <OshiAvatar oshi={oshi} size={46} />
      </button>
      {/* メニューは画面全体のいちばん上に出す(ほかの表示と重ならないよう、ページの最上位に置く) */}
      {menu ? createPortal(<OshiMenu oshi={oshi} onClose={() => setMenu(false)} />, document.body) : null}
      <button type="button" onClick={() => setSheet("react")} className={item} aria-label="いいね・コメントなど">
        <span className={round}>
          <Icon d={ICON.heart} />
        </span>
        反応
      </button>
      <button type="button" onClick={() => setSheet("share")} className={item} aria-label="開く・共有・リンクをコピー">
        <span className={round}>
          <Icon d={ICON.share} />
        </span>
        {copied ? "コピー済み" : "共有"}
      </button>
      {sheet === "share" ? <Sheet title="開く・共有" items={shareItems} onClose={() => setSheet(null)} /> : null}
      {sheet === "react" ? <Sheet title={`${platform}で反応する`} items={reactItems} onClose={() => setSheet(null)} /> : null}
      <button
        type="button"
        onClick={toggleMute}
        className={item}
        aria-pressed={silent}
        aria-label={waiting ? "音なしで再生中(タップで音が出ます)" : muted ? "ミュート中(押すと音が出ます)" : "ミュートする"}
      >
        <span className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur ${soundTone}`}>
          <Icon d={silent ? ICON.muted : ICON.sound} />
        </span>
        {waiting ? "タップで音" : muted ? "ミュート中" : "音あり"}
      </button>
      {modeNote
        ? createPortal(
            <p className="fixed top-1/2 left-1/2 z-[70] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-5 py-2.5 text-sm font-bold whitespace-nowrap text-black shadow-xl">
              {modeNote}
            </p>,
            document.body,
          )
        : null}
      {/* マスターは「管理」(設定も管理の中から開ける)、それ以外は「設定」。Sensitive を見ているときはピンク */}
      {isAdmin ? (
        <Link href="/admin" className={item} aria-label="管理(長押しで通常とSensitiveを切り替え)" {...newPress}>
          <span className={`${round} ${mode === "sensitive" ? "!bg-[#ff2d6f]" : ""}`}>
            <Icon d={ICON.admin} />
          </span>
          管理
        </Link>
      ) : (
        <Link href="/app/settings" className={item} aria-label="設定(長押しで通常とSensitiveを切り替え)" {...newPress}>
          <span className={`${round} ${mode === "sensitive" ? "!bg-[#ff2d6f]" : ""}`}>
            <Icon d={ICON.settings} />
          </span>
          設定
        </Link>
      )}
    </div>
  );
}

function Info({ platform, oshi, from, time, title, isNew }: {
  platform: string; oshi: Oshi; from: string; time: string; title?: string; isNew: boolean;
}) {
  const label = fromLabel(from);
  return (
    <div className="pointer-events-none absolute right-20 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-4 z-10 [text-shadow:0_1px_4px_rgba(0,0,0,.7)]">
      <span className="inline-flex h-6 items-center rounded-md bg-white/20 px-2 text-[11px] font-extrabold backdrop-blur">
        {platform}
      </span>
      <p className="mt-2 flex items-center gap-2 text-base font-black">
        <span className="truncate">{oshi.name}</span>
        {time ? (
          <span className="shrink-0 text-xs font-bold text-white/75" suppressHydrationWarning>
            ・{time}
          </span>
        ) : null}
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
  item: TimelineItem; from: string; oshi: Oshi; live: boolean; near: boolean; muted: boolean; onToggleSound: () => boolean;
}) {
  const title = decodeEntities(item.title);
  const isNew = item.published_at > oshi.last_seen_at;
  const time = formatRelative(item.published_at);
  const videoId = item.platform === "youtube" ? youtubeVideoId(item.url) : null;
  const short = isYoutubeShort(item.url);
  const frame = useRef<HTMLIFrameElement>(null);

  const { activated } = useContext(Controls);
  const send = useCallback((func: string) => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
  }, []);

  // 音のオン・オフは YouTube の埋め込みに命令を送って切り替える(画面に出ている1件だけ)。
  // 自動再生を確実に始めるため音なしで読み込み、画面を一度でも触っていれば音をオンにする。
  // 起動直後(まだ触っていない)に音をオンにすると、ブラウザが再生を止めてしまうので、触るまでは音なしで再生する
  const sound = !muted && activated;
  // 音を切り替えたときに YouTube が再生を止めることがあるので、切り替えたら必ず再生をかけ直す
  useEffect(() => {
    if (!live || !frame.current) return;
    send(sound ? "unMute" : "mute");
    send("playVideo");
  }, [sound, live, send]);

  // 動画は止めない(タップは音のオン・オフだけ)。YouTube が止まったら(音を出せないと判断されたときなど)すぐ再生し直し、
  // 続けて止まるときは音なしにして再生を続ける
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  useEffect(() => {
    if (!live) return;
    let pauses = 0;
    let lastPause = 0;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || typeof event.data !== "string") return;
      const data = safeJson(event.data) as { event?: string; info?: unknown } | null;
      if (!data) return;
      const state =
        data.event === "onStateChange" ? data.info
          : data.event === "infoDelivery" && data.info && typeof data.info === "object" ? (data.info as { playerState?: number }).playerState
            : undefined;
      if (state !== 2) return;
      const now = Date.now();
      pauses = now - lastPause < 3000 ? pauses + 1 : 1;
      lastPause = now;
      if (pauses >= 3 && soundRef.current) send("mute");
      send("playVideo");
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [live, send]);

  // タップは音のオン・オフだけ。タップの操作の中ですぐ命令を送る(ブラウザが音を許すのは操作の中だけのため)
  const tap = () => {
    const on = onToggleSound();
    send(on ? "unMute" : "mute");
    send("playVideo");
  };

  // 字幕は出さない(動画の設定で字幕が自動で出るものも、読み込み後に字幕を外す)
  // 字幕はいつもオフ(YouTube の設定で字幕が自動で出るものも)。字幕のトラックを空にしてから、字幕の機能も外す
  const hideCaptions = () => {
    const target = frame.current?.contentWindow;
    if (!target) return;
    const command = (func: string, args: unknown[]) =>
      target.postMessage(JSON.stringify({ event: "command", func, args }), "*");
    for (const name of ["captions", "cc"]) {
      command("setOption", [name, "track", {}]);
      command("unloadModule", [name]);
    }
  };

  // 再生が始まってから字幕が読み込まれることがあるため、画面に出ている間は最初の20秒ほど何度か外し直す
  useEffect(() => {
    if (!live) return;
    const timers = [500, 1500, 3000, 5000, 8000, 12000, 20000].map((wait) => setTimeout(hideCaptions, wait));
    return () => timers.forEach(clearTimeout);
  }, [live]);

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
          className="absolute inset-x-0 top-[var(--bar)] bottom-0 z-[6] flex flex-col justify-center px-6 pr-20 pb-44"
        >
          <p className="truncate text-xs font-extrabold tracking-wide text-white/80">BLOG ・ {hostOf(item.url)}</p>
          <p className="mt-4 line-clamp-[8] text-[26px] leading-[1.45] font-black [text-shadow:0_2px_12px_rgba(0,0,0,.35)]">{title}</p>
        </a>
        <SideActions oshi={oshi} url={item.url} title={title} platform="Blog" reactions={[{ label: "記事を開いてコメント・いいね", note: hostOf(item.url), href: item.url }]} />
        <Info platform="Blog" oshi={oshi} from={from} time={time} isNew={isNew} />
      </>
    );
  }

  const thumb = item.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const src =
    `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1` +
    `&loop=1&playlist=${videoId}&enablejsapi=1&cc_load_policy=0&iv_load_policy=3&hl=ja`;
  return (
    <>
      {/* 背景: サムネイルをぼかして敷く */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumb} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl" />
      <div className={short ? "absolute inset-0 flex items-center justify-center overflow-hidden" : "absolute inset-x-0 top-1/2 -translate-y-[58%]"}>
        <div className={short ? "relative shrink-0" : "relative aspect-video w-full"} style={short ? VERTICAL_FRAME : undefined}>
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
                  // 再生の状態を知らせてもらう(止まったら再生し直すため)
                  frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: videoId }), "*");
                  // 止まっていたら再生し直す(起動直後に自動再生が始まらないことがあるため)
                  for (const wait of [300, 1200]) {
                    setTimeout(() => {
                      send(sound ? "unMute" : "mute");
                      send("playVideo");
                    }, wait);
                  }
                  hideCaptions();
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
      <SideActions
        oshi={oshi}
        url={item.url}
        title={title}
        platform="YouTube"
        reactions={[
          { label: "YouTubeで高く評価(いいね)・コメント", note: "YouTube を開きます", href: item.url },
          { label: "チャンネル登録", note: "YouTube を開きます", href: `${item.url}${item.url.includes("?") ? "&" : "?"}sub_confirmation=1` },
        ]}
      />
      <Info platform={short ? "YouTube ショート" : "YouTube"} oshi={oshi} from={from} time={time} title={title} isNew={isNew} />
    </>
  );
}

// X・Instagram・TikTok の1枚。画面に出ている間だけ公式の埋め込みを読み込む
function EmbedSlide({ source, from, oshi, live }: { source: Source; from: string; oshi: Oshi; live: boolean }) {
  return (
    <>
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 70% 10%, ${oshi.color}88, #000 70%)` }} />
      <div className="absolute inset-x-0 top-[var(--bar)] bottom-0 overflow-hidden bg-white text-black">
        {live ? (
          <EmbedCard source={source} oshiName={oshi.name} fill autoLoad />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-black/50">{PLATFORM_LABEL[source.platform]}</div>
        )}
      </div>
      <SideActions oshi={oshi} url={source.url} title={`${oshi.name}の${PLATFORM_LABEL[source.platform]}`} platform={PLATFORM_LABEL[source.platform]} />
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

// Threads・Fantia・myfans・xfans: 中身は読み込まず、推しのページへ移るカードを出す
function LinkSlide({ source, from, oshi }: { source: Source; from: string; oshi: Oshi }) {
  const label = PLATFORM_LABEL[source.platform];
  return (
    <>
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 50% 30%, ${oshi.color}aa, #000 75%)` }} />
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-x-0 top-[var(--bar)] bottom-0 z-[6] flex flex-col items-center justify-center gap-4 px-8 pb-40 text-center"
      >
        <OshiAvatar oshi={oshi} size={88} />
        <p className="text-2xl font-black">{label}</p>
        <p className="text-sm text-white/75">{source.handle}</p>
        <span className="mt-2 flex h-12 items-center rounded-full bg-white px-8 text-[15px] font-bold text-black">{label}で見る</span>
      </a>
      <SideActions oshi={oshi} url={source.url} title={`${oshi.name}の${label}`} platform={label} />
      <Info platform={label} oshi={oshi} from={from} time="" title={`${label} ${source.handle}`} isNew={false} />
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
            className="absolute inset-x-0 top-[var(--bar)] bottom-0 h-[calc(100%-var(--bar))] w-full object-contain"
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
          <div className="absolute inset-x-0 top-[var(--bar)] bottom-0 overflow-hidden bg-white">
            {near && media ? (
              <InstagramPost code={code} title={`${oshi.name}のInstagramの投稿`} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-black/50">Instagram</div>
            )}
          </div>
        </>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
      <SideActions oshi={oshi} url={url} title={`${oshi.name}のInstagramの投稿`} platform="Instagram" />
      <Info platform="Instagram" oshi={oshi} from={from} time="" title={source.handle ? `Instagram ${source.handle}` : undefined} isNew={false} />
    </>
  );
}

type Tweet = {
  id: string;
  text: string;
  at: string;
  user: { name: string; handle: string; avatar: string | null };
  media: { type: "photo" | "video"; url: string; poster: string | null; width: number; height: number }[];
  links: { from: string; to: string; display: string }[];
};

// 本文の中のリンク(URL)・@アカウント・#ハッシュタグを押せるようにする
function LinkedText({ text, links }: { text: string; links: Tweet["links"] }) {
  const parts: React.ReactNode[] = [];
  const pattern = /(https?:\/\/[^\s]+)|(@[A-Za-z0-9_]{1,15})|([#＃][\p{L}\p{N}_]+)/gu;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const token = match[0];
    let href = token;
    let label = token;
    if (match[1]) {
      const link = links.find((l) => l.from === token);
      href = link?.to ?? token;
      label = link?.display ?? token.replace(/^https?:\/\//, "");
    } else if (match[2]) {
      href = `https://x.com/${token.slice(1)}`;
    } else {
      href = `https://x.com/hashtag/${encodeURIComponent(token.slice(1))}`;
    }
    parts.push(
      <a key={`${index}-${token}`} href={href} target="_blank" rel="noopener noreferrer" className="text-sky-400 [overflow-wrap:anywhere]">
        {label}
      </a>,
    );
    last = index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// 写真・動画が複数あるときは、横にスワイプして見る(ここでの横スワイプは、隣の推しへの切り替えに使わない)
function MediaCarousel({ media, near, video }: { media: Tweet["media"]; near: boolean; video: React.Ref<HTMLVideoElement> }) {
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  return (
    <div
      className="relative mt-3"
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      <div
        ref={strip}
        onScroll={(event) => {
          const el = event.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-xl [scrollbar-width:none]"
      >
        {media.map((m, i) => (
          <div key={m.url} className="flex w-full shrink-0 snap-center items-center justify-center bg-black/40">
            {m.type === "video" ? (
              <video
                ref={i === media.findIndex((x) => x.type === "video") ? video : undefined}
                src={m.url}
                poster={m.poster ?? undefined}
                playsInline
                loop
                muted
                preload={near ? "metadata" : "none"}
                className="w-full bg-black"
                style={{ aspectRatio: `${m.width} / ${m.height}`, maxHeight: "62dvh" }}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.url}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                className="w-full object-contain"
                style={{ aspectRatio: `${m.width} / ${m.height}`, maxHeight: "62dvh" }}
              />
            )}
          </div>
        ))}
      </div>
      {media.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-label={`${index + 1} / ${media.length}`}>
          {media.map((m, i) => (
            <span key={m.url} className={`h-1.5 rounded-full transition-all ${i === index ? "w-4 bg-white" : "w-1.5 bg-white/35"}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// X の投稿1件。本文(長い投稿も全文)・写真・動画をアプリで直接表示する(「さらに表示」を押す必要がない)。
// 本文が画面に収まらないときだけ、その中で上下にスクロールでき、端まで行けば次の投稿へスワイプで進む。
// 中身を読めなかったときは X 公式の投稿埋め込みに戻す。前後1枚まで先に読み込む
function TweetSlide({ source, id, at, from, oshi, near, live }: {
  source: Source; id: string; at: string; from: string; oshi: Oshi; near: boolean; live: boolean;
}) {
  const handle = source.handle.replace(/^@/, "");
  const url = `https://x.com/${handle}/status/${id}`;
  const { muted } = useContext(Controls);
  const [tweet, setTweet] = useState<Tweet | null | undefined>(undefined);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!near || tweet !== undefined) return;
    let cancelled = false;
    fetch(`/api/x-tweet?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Tweet>) : null))
      .then((t) => {
        if (!cancelled) setTweet(t);
      })
      .catch(() => {
        if (!cancelled) setTweet(null);
      });
    return () => {
      cancelled = true;
    };
  }, [near, tweet, id]);

  // 動画は画面に出ている間だけ再生する(音はミュートボタンに合わせる)
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.muted = muted;
    if (live) void element.play().catch(() => {});
    else element.pause();
  }, [live, muted, tweet]);

  return (
    <>
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 70% 10%, ${oshi.color}66, #000 70%)` }} />
      {tweet ? (
        <div className="absolute inset-x-0 top-[var(--bar)] bottom-0 overflow-y-auto [scrollbar-width:none]">
          <article className="min-h-full px-4 pt-3 pr-20 pb-[calc(9rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3">
              {tweet.user.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tweet.user.avatar} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full" />
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold">{tweet.user.name}</p>
                <p className="truncate text-[13px] text-white/60">@{tweet.user.handle}</p>
              </div>
            </div>
            {tweet.text ? (
              <p className="mt-3 text-[16px] leading-7 whitespace-pre-wrap [overflow-wrap:anywhere]">
                <LinkedText text={tweet.text} links={tweet.links ?? []} />
              </p>
            ) : null}
            {tweet.media.length > 0 ? <MediaCarousel media={tweet.media} near={near} video={video} /> : null}
          </article>
        </div>
      ) : (
        <>
          <div className="absolute inset-x-0 top-[var(--bar)] bottom-0 overflow-hidden bg-black pb-40">
            {near && tweet === null ? (
              <XPostEmbed id={id} url={url} theme="dark" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/50">X</div>
            )}
          </div>
          {/* 埋め込みの上の透明な層: 上下のスワイプを受け取る */}
          <div className="absolute inset-0 z-[5]" />
        </>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" />
      <SideActions
        oshi={oshi}
        url={url}
        title={`${oshi.name}のXの投稿`}
        platform="X"
        reactions={[
          { label: "いいね", note: "X の画面で確定します", href: `https://x.com/intent/like?tweet_id=${id}` },
          { label: "リポスト(リツイート)", note: "X の画面で確定します", href: `https://x.com/intent/retweet?tweet_id=${id}` },
          { label: "返信(コメント)", note: "X の画面で書きます", href: `https://x.com/intent/tweet?in_reply_to=${id}` },
        ]}
      />
      <Info platform="X" oshi={oshi} from={from} time={formatRelative(at)} isNew={at > oshi.last_seen_at} />
    </>
  );
}

// TikTok の動画1本。TikTok 公式の動画プレーヤーを全画面で出す。画面に出ている1本だけ読み込み、自動で再生する。
// タップで音のオン・オフ(プレーヤーに命令を送る)
function TikTokSlide({ source, id, at, from, oshi, live, muted, onToggleSound }: {
  source: Source; id: string; at: string | null; from: string; oshi: Oshi; live: boolean; muted: boolean; onToggleSound: () => boolean;
}) {
  const handle = source.handle.replace(/^@/, "");
  const url = `https://www.tiktok.com/@${handle}/video/${id}`;
  const frame = useRef<HTMLIFrameElement>(null);
  const send = useCallback((type: string) => {
    frame.current?.contentWindow?.postMessage({ "x-tiktok-player": true, type }, "*");
  }, []);
  const { activated } = useContext(Controls);
  // 画面を初めて触るまでは音なしで再生する(起動直後に音をオンにすると、ブラウザが再生を止めてしまう)。
  // 触ったら音の設定を送り直す
  const sound = !muted && activated;
  // 音を切り替えたら再生もかけ直す(音の切り替えで止まらないように)
  useEffect(() => {
    if (!live) return;
    send(sound ? "unMute" : "mute");
    send("play");
  }, [sound, live, send]);

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
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="relative shrink-0" style={VERTICAL_FRAME}>
          {live ? (
            <iframe
              ref={frame}
              title={`${oshi.name}のTikTok`}
              src={src}
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => {
                for (const wait of [300, 1200]) {
                  setTimeout(() => {
                    send(sound ? "unMute" : "mute");
                    send("play");
                  }, wait);
                }
              }}
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : null}
        </div>
      </div>
      {/* 動画の上の透明な層: 上下のスワイプを受け取り、タップで音を切り替える */}
      <button type="button" aria-label={muted ? "音を出す" : "音を消す"} onClick={() => {
          const on = onToggleSound();
          send(on ? "unMute" : "mute");
          send("play");
        }}
        className="absolute inset-0 z-[5] cursor-pointer"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />
      <SideActions oshi={oshi} url={url} title={`${oshi.name}のTikTok`} platform="TikTok" />
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
