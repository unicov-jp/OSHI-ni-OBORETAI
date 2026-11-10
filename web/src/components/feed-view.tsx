"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { Dialog } from "@/components/dialog";
import { EmbedCard } from "@/components/embeds";
import { OshiAvatar } from "@/components/oshi-avatar";
import {
  Badge, Button, buttonClass, Clamp, EmptyState, formatDateTime, formatRelative, Light, Notice, PlatformTag,
} from "@/components/ui";
import { loadMore, markSeen } from "@/lib/actions/oshi";
import { PLATFORM_LABEL, PLATFORM_ORDER, youtubeVideoId } from "@/lib/platforms";
import { feedHref, VIEW_LABEL, VIEW_MODES, type Tab } from "@/lib/tabs";
import { decodeEntities, hostOf } from "@/lib/text";
import type { Oshi, Platform, Source, TimelineItem, ViewMode } from "@/lib/types";

type Props = {
  view: ViewMode;
  tabs: Tab[];
  activeTab: Tab;
  platform: Platform | "all";
  oshi: Oshi[];
  sources: Source[];
  items: TimelineItem[];
  pageSize: number;
};

const EMBED_PLATFORMS: Platform[] = ["x", "instagram", "tiktok"];

type Card = { item: TimelineItem; owners: Oshi[] };

function waterline(colors: string[]): CSSProperties {
  const list = colors.length > 0 ? colors : ["var(--line)"];
  return {
    background: list.length === 1 ? list[0] : `linear-gradient(90deg, ${list.join(", ")})`,
  };
}

function Lights({ colors, className }: { colors: string[]; className: string }) {
  return (
    <span className="flex shrink-0 items-end gap-[3px]">
      {(colors.length > 0 ? colors : ["var(--line)"]).map((color) => (
        <Light key={color} color={color} className={className} />
      ))}
    </span>
  );
}

function Unread({ count }: { count: number }) {
  if (count <= 0) return <span className="w-8 shrink-0" />;
  return (
    <span className="num flex h-5 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-brand-ink">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function FeedView({ view, tabs, activeTab, platform, oshi, sources, items: initialItems, pageSize }: Props) {
  const [items, setItems] = useState(initialItems);
  const [hasMore, setHasMore] = useState(initialItems.length >= pageSize);
  const [detail, setDetail] = useState<Card | null>(null);
  const [embedLimit, setEmbedLimit] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);

  // 手動の「更新」: 登録したYouTube・Blogの新着をその場で取りに行き、画面を読み直す
  const refresh = async () => {
    setRefreshing(true);
    setRefreshNote(null);
    try {
      const response = await fetch("/api/feeds/refresh", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string; claimed?: number; ok?: number; failed?: number; added?: number;
      };
      if (!response.ok) {
        setRefreshNote({ tone: "danger", text: body.error ?? "更新できませんでした" });
      } else if (!body.claimed) {
        setRefreshNote({ tone: "ok", text: "最新の状態です(取得から10分以内のものは取り直しません)" });
      } else {
        const failed = body.failed ? `(${body.failed}件は取得できませんでした)` : "";
        setRefreshNote({
          tone: body.failed ? "warn" : "ok",
          text: body.added ? `新着が${body.added}件ありました${failed}` : `新着はありませんでした${failed}`,
        });
        router.refresh();
      }
    } catch {
      setRefreshNote({ tone: "danger", text: "通信できませんでした。電波の良いところでお試しください。" });
    } finally {
      setRefreshing(false);
    }
  };

  const oshiById = useMemo(() => new Map(oshi.map((o) => [o.id, o])), [oshi]);
  const tabSources = useMemo(
    () => sources.filter((s) => activeTab.oshiIds.includes(s.oshi_id)),
    [sources, activeTab.oshiIds],
  );
  const platforms = PLATFORM_ORDER.filter((p) => tabSources.some((s) => s.platform === p));

  // タブを開いてしばらくしたら既読にする(未読件数の基準を進める)
  const seenKey = activeTab.oshiIds.join(",");
  useEffect(() => {
    if (!seenKey || activeTab.unread === 0) return;
    const timer = setTimeout(() => void markSeen(seenKey.split(",")), 1500);
    return () => clearTimeout(timer);
  }, [seenKey, activeTab.unread]);

  const more = () => {
    const last = items[items.length - 1];
    if (!last) return;
    setError(null);
    startTransition(async () => {
      const result = await loadMore({
        oshiIds: activeTab.oshiIds,
        platform: platform === "youtube" || platform === "blog" ? platform : undefined,
        before: last.published_at,
      });
      if (!result.ok) return setError(result.error);
      const next = result.data ?? [];
      setItems((current) => [...current, ...next]);
      setHasMore(next.length >= pageSize);
    });
  };

  // 同じ取得元を複数の推しに登録していると同じ項目が推しの数だけ届くので、1枚にまとめて推しを並べる
  const cards = useMemo(() => {
    const byId = new Map<string, Card>();
    for (const item of items) {
      const owner = oshiById.get(item.oshi_id);
      const card = byId.get(item.item_id);
      if (card) {
        if (owner && !card.owners.some((o) => o.id === owner.id)) card.owners.push(owner);
      } else {
        byId.set(item.item_id, { item, owners: owner ? [owner] : [] });
      }
    }
    return [...byId.values()];
  }, [items, oshiById]);

  const isEmbedView = EMBED_PLATFORMS.includes(platform as Platform);
  const isLinkView = platform === "link" || platform === "threads";
  const visibleSources = platform === "all" ? tabSources : tabSources.filter((s) => s.platform === platform);
  const single = activeTab.oshiIds.length === 1 ? oshiById.get(activeTab.oshiIds[0]) : undefined;
  const subtitle = single
    ? single.note || `登録アカウント ${tabSources.length}件`
    : `${activeTab.oshiIds.length}人 / 登録アカウント ${tabSources.length}件`;

  return (
    <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-6">
      {/* タブ: PCは左の縦並び、スマホは横スクロール */}
      <aside className="lg:sticky lg:top-[76px] lg:h-[calc(100dvh-96px)] lg:overflow-y-auto">
        <div role="group" aria-label="表示単位" className="grid h-10 grid-cols-3 rounded-lg border border-line bg-sunken p-[3px]">
          {VIEW_MODES.map((mode) => (
            <Link
              key={mode}
              href={feedHref({ view: mode })}
              aria-current={mode === view ? "true" : undefined}
              className={`flex items-center justify-center rounded-md text-[13px] font-medium whitespace-nowrap ${
                mode === view ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
              }`}
            >
              {VIEW_LABEL[mode]}
            </Link>
          ))}
        </div>

        <nav aria-label={`${VIEW_LABEL[view]}のタブ`} className="scroll-x mt-3 flex gap-2 pb-2 lg:flex-col lg:gap-1 lg:pb-0">
          {tabs.map((tab) => {
            const active = tab.id === activeTab.id;
            return (
              <Link
                key={tab.id}
                href={feedHref({ view, tab: tab.id })}
                aria-current={active ? "page" : undefined}
                className={`flex h-12 w-[168px] shrink-0 items-center gap-3 rounded-lg border px-3 lg:w-full ${
                  active ? "border-line bg-surface" : "border-transparent hover:bg-sunken"
                }`}
              >
                {tab.oshiIds.length === 1 && tab.id !== "all" ? (
                  <OshiAvatar oshi={oshiById.get(tab.oshiIds[0])} size={28} />
                ) : (
                  <Lights colors={tab.colors.slice(0, 3)} className="h-7 w-[5px]" />
                )}
                <Clamp className={`flex-1 text-sm ${active ? "font-semibold" : "font-medium text-muted"}`}>{tab.name}</Clamp>
                <Unread count={tab.unread} />
              </Link>
            );
          })}
        </nav>
      </aside>

      <main className="mt-4 min-w-0 lg:mt-0">
        <header className="flex h-[60px] items-center gap-4">
          <div className="min-w-0 flex-1">
            <Clamp as="h2" className="text-xl leading-7 font-bold">{activeTab.name}</Clamp>
            <Clamp as="p" className="text-[13px] text-muted">{subtitle}</Clamp>
          </div>
          <Button size="sm" className="w-[88px]" onClick={refresh} disabled={refreshing}>
            {refreshing ? "更新中" : "更新"}
          </Button>
          <Link href="/app/manage" className={buttonClass("secondary", "sm")}>
            SNSを登録
          </Link>
        </header>
        {/* 水面の線: このタブのメンバーカラー */}
        <div aria-hidden className="h-[3px] rounded-full" style={waterline(activeTab.colors)} />
        {refreshNote ? (
          <div className="mt-3">
            <Notice tone={refreshNote.tone}>{refreshNote.text}</Notice>
          </div>
        ) : null}

        <nav aria-label="サービスで絞り込む" className="scroll-x mt-4 flex gap-2 pb-1">
          {(["all", ...platforms] as (Platform | "all")[]).map((p) => {
            const active = p === platform;
            return (
              <Link
                key={p}
                href={feedHref({ view, tab: activeTab.id, platform: p })}
                aria-current={active ? "true" : undefined}
                className={`flex h-9 w-[96px] shrink-0 items-center justify-center rounded-full border text-[13px] font-medium whitespace-nowrap ${
                  active ? "border-text bg-text text-bg" : "border-line bg-surface text-muted hover:text-text"
                }`}
              >
                {p === "all" ? "すべて" : PLATFORM_LABEL[p]}
              </Link>
            );
          })}
        </nav>

        <div className="mt-5 space-y-6">
          {tabSources.length === 0 ? (
            <EmptyState
              title="まだアカウントが登録されていません"
              body="推しのYouTube・Blog・X・Instagram・TikTokのURLを登録すると、ここにまとまります。"
              action={
                <Link href="/app/manage" className={buttonClass("primary")}>
                  SNSを登録する
                </Link>
              }
            />
          ) : isEmbedView ? (
            <>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))" }}>
                {visibleSources.slice(0, embedLimit).map((source) => (
                  <EmbedCard key={source.id} source={source} oshiName={oshiById.get(source.oshi_id)?.name ?? ""} />
                ))}
              </div>
              {visibleSources.length > embedLimit ? (
                <div className="flex justify-center">
                  <Button onClick={() => setEmbedLimit((n) => n + 4)}>さらに4件表示する</Button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              {isLinkView ? (
                <LinkGrid sources={visibleSources} oshiById={oshiById} />
              ) : null}
              {platform === "all" ? (
                <AccountStrip
                  sources={tabSources}
                  oshiById={oshiById}
                  showOshi={!single}
                  view={view}
                  tabId={activeTab.id}
                />
              ) : null}

              {!isLinkView ? (
                items.length === 0 ? (
                  <EmptyState
                    title="新着はまだありません"
                    body="YouTubeとBlogの新着は毎日18:00に自動で取得してここに並びます。すぐに見たいときは「更新」を押してください。X・Instagram・TikTokは上の絞り込みから開けます。"
                  />
                ) : (
                  <div className="card-grid">
                    {cards.map((card) => (
                      <ItemCard
                        key={card.item.item_id}
                        item={card.item}
                        owners={card.owners}
                        onOpen={() => setDetail(card)}
                      />
                    ))}
                  </div>
                )
              ) : null}

              {error ? <Notice tone="danger">{error}</Notice> : null}
              {!isLinkView && hasMore ? (
                <div className="flex justify-center">
                  <Button onClick={more} disabled={pending}>
                    {pending ? "読み込み中" : "さらに読み込む"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>

      <ItemDialog card={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

// 登録アカウントの一覧。大きさ固定のタイルを横に並べる。
function AccountStrip({
  sources, oshiById, showOshi, view, tabId,
}: {
  sources: Source[];
  oshiById: Map<string, Oshi>;
  showOshi: boolean;
  view: ViewMode;
  tabId: string;
}) {
  if (sources.length === 0) return null;
  return (
    <section aria-label="登録アカウント">
      <div className="scroll-x flex gap-2 pb-2">
        {sources.map((source) => {
          const owner = oshiById.get(source.oshi_id);
          const isEmbed = source.mode === "embed";
          const content = (
            <>
              <Light color={owner?.color ?? "var(--line)"} className="h-8 w-[4px]" />
              <span className="min-w-0 flex-1">
                <span className="clamp-1 block text-xs text-muted">{PLATFORM_LABEL[source.platform]}</span>
                <span className="clamp-1 block text-[13px] font-medium">
                  {showOshi && owner ? owner.name : source.label || source.handle}
                </span>
              </span>
            </>
          );
          const className =
            "flex h-14 w-[176px] shrink-0 items-center gap-3 rounded-lg border border-line bg-surface px-3 hover:bg-sunken";
          const title = `${owner?.name ?? ""} ${PLATFORM_LABEL[source.platform]} ${source.handle}`;
          return isEmbed ? (
            <Link key={source.id} href={feedHref({ view, tab: tabId, platform: source.platform })} title={title} className={className}>
              {content}
            </Link>
          ) : (
            <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" title={title} className={className}>
              {content}
            </a>
          );
        })}
      </div>
    </section>
  );
}

// 新着1件。カードの高さは固定で、見出しは2行で省略する。押すと全文を表示する。
function ItemCard({ item, owners, onOpen }: { item: TimelineItem; owners: Oshi[]; onOpen: () => void }) {
  const first = owners[0];
  const isNew = owners.some((o) => item.published_at > o.last_seen_at);
  const names = owners.map((o) => o.name).join("・");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-left hover:border-muted"
    >
      <span className="relative block aspect-video w-full shrink-0 overflow-hidden bg-sunken">
        {item.thumbnail_url ? (
          // 取得元(YouTube)の画像を直接表示する。当アプリのサーバーには保存しない。
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.thumbnail_url}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-lg font-bold text-muted/70"
            style={{
              background: `linear-gradient(160deg, color-mix(in srgb, ${first?.color ?? "transparent"} 22%, transparent), transparent 70%)`,
            }}
          >
            {PLATFORM_LABEL[item.platform]}
          </span>
        )}
        {isNew ? (
          <span className="absolute top-2 left-2">
            <Badge tone="brand">新着</Badge>
          </span>
        ) : null}
      </span>
      <span className="flex h-[92px] w-full shrink-0 flex-col justify-between p-3">
        <Clamp lines={2} className="text-sm leading-5 font-medium">{decodeEntities(item.title)}</Clamp>
        <span className="flex items-center gap-2 text-xs text-muted">
          <span className="flex shrink-0 -space-x-1">
            {(owners.length > 0 ? owners.slice(0, 3) : [undefined]).map((o, i) => (
              <OshiAvatar key={o?.id ?? i} oshi={o} size={18} />
            ))}
          </span>
          <Clamp className="flex-1">{names}</Clamp>
          <time dateTime={item.published_at} className="num shrink-0" suppressHydrationWarning>
            {formatRelative(item.published_at)}
          </time>
        </span>
      </span>
    </button>
  );
}

// リンクとして保存したアカウント(Threads・公式サイトなど)。押すと新しいタブで開く。
function LinkGrid({ sources, oshiById }: { sources: Source[]; oshiById: Map<string, Oshi> }) {
  if (sources.length === 0) return null;
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))" }}>
      {sources.map((source) => {
        const owner = oshiById.get(source.oshi_id);
        return (
          <a
            key={source.id}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.url}
            className="flex h-[76px] min-w-0 items-center gap-3 rounded-xl border border-line bg-surface px-4 hover:bg-sunken"
          >
            <Light color={owner?.color ?? "var(--line)"} className="h-10 w-[5px]" />
            <span className="min-w-0 flex-1">
              <span className="clamp-1 block text-[15px] font-semibold">{source.label || hostOf(source.url)}</span>
              <span className="clamp-1 block text-xs text-muted">
                {owner?.name ?? ""}・{PLATFORM_LABEL[source.platform]}
              </span>
            </span>
            <span className="shrink-0 text-[13px] font-medium text-muted">開く</span>
          </a>
        );
      })}
    </div>
  );
}

function ItemDialog({ card, onClose }: { card: Card | null; onClose: () => void }) {
  const item = card?.item ?? null;
  const title = item ? decodeEntities(item.title) : "";
  const videoId = item && item.platform === "youtube" ? youtubeVideoId(item.url) : null;
  return (
    <Dialog
      open={item !== null}
      onClose={onClose}
      title={card && card.owners.length > 0 ? card.owners.map((o) => o.name).join("・") : "詳細"}
      wide
      footer={
        item ? (
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={buttonClass("primary")}>
            {item.platform === "youtube" ? "YouTubeで開く" : "記事を開く"}
          </a>
        ) : null
      }
    >
      {item ? (
        <div className="space-y-4">
          {videoId ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-sunken">
              <iframe
                title={title}
                src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                allow="encrypted-media; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                className="h-full w-full border-0"
              />
            </div>
          ) : null}
          <p className="text-base leading-7 font-semibold [overflow-wrap:anywhere]">{title}</p>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <PlatformTag platform={item.platform} />
            <time dateTime={item.published_at}>{formatDateTime(item.published_at)}</time>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
