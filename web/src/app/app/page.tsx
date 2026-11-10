import type { Metadata } from "next";
import type { TimelineItem } from "@/lib/types";
import Link from "next/link";
import { BackToNormal } from "@/components/mode-switch";
import { SwipeFeed, type FeedView } from "@/components/swipe-feed";
import { getFeedMode, oshiInMode } from "@/lib/feed-mode";
import { canUseAdvanced } from "@/lib/plans";
import { EmptyState, buttonClass } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { getLatestByOshi, getLibrary, getManualPosts, getSavedPosts, getTimeline, getUnreadCounts, PAGE_SIZE } from "@/lib/data";
import { instagramPostCodes } from "@/lib/fetchers/instagram";
import { tiktokVideos } from "@/lib/fetchers/tiktok";
import { xPosts } from "@/lib/fetchers/x";
import { getCalendar, getGallery } from "@/lib/memories";

export const metadata: Metadata = { title: "投稿" };

type Search = Promise<{ tab?: string; view?: string }>;

// 新着: 推しを1人選び、その推しと所属グループの新着をまとめて上下のスワイプで見る(推し単位のみ)。
// 右へスワイプでその推しのカレンダー(?view=calendar)、左へスワイプでギャラリー(?view=gallery)に切り替える。
export default async function FeedPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const [viewer, library, unread, latest] = await Promise.all([
    requireViewer(),
    getLibrary(),
    getUnreadCounts(),
    getLatestByOshi(),
  ]);
  // 通常 / Sensitive のどちらの推しを見るか(設定・管理ボタンの長押しで切り替える)
  const mode = await getFeedMode(viewer);
  const inMode = oshiInMode(library.oshi, mode);
  // 上部の推しのアイコンは、新着が新しく届いた推しから順に並べる(新着がまだ無い推しは、登録の順で後ろに)
  const ordered = inMode
    .map((o, index) => ({ o, index, at: latest[o.id] ?? "" }))
    .sort((a, b) => (a.at === b.at ? a.index - b.index : a.at < b.at ? 1 : -1))
    .map((x) => x.o);

  if (mode === "sensitive" && inMode.length === 0) {
    return (
      <EmptyState
        title="Sensitive の推しはまだいません"
        body="推しを登録するときに「Sensitive」を ON にすると、ここに並びます。"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/app/manage?new=1" className={buttonClass("primary")}>
              Sensitive の推しを登録
            </Link>
            <BackToNormal />
          </div>
        }
      />
    );
  }

  if (inMode.length === 0) {
    return (
      <EmptyState
        title="推しがまだ登録されていません"
        body="推しを登録すると、ここに推しごとの新着が並びます。"
        action={
          <Link href="/app/manage" className={buttonClass("primary")}>
            推しの登録を開く
          </Link>
        }
      />
    );
  }

  const active = ordered.find((o) => o.id === params.tab) ?? ordered[0];
  const sources = library.sources.filter((s) => s.oshi_id === active.id);
  // 今のアプリの登録(本人・グループ)のうち、まだ取り込んでいないSNSの数(新着の画面が裏で自動で取り込む)
  const normalize = (url: string) => url.toLowerCase().replace(/^https?:\/\/(www\.|m\.)?/, "").replace(/\/+$/, "");
  const pendingSns = library.oshi.reduce((total, o) => {
    const registered = new Set(library.sources.filter((s) => s.oshi_id === o.id).map((s) => normalize(s.url)));
    return total + new Set(o.sns.map((s) => normalize(s.url)).filter((url) => !registered.has(url))).size;
  }, 0);
  const handleOf = (handle: string) => handle.replace(/^@/, "");
  const view: FeedView = params.view === "gallery" || params.view === "calendar" ? params.view : "feed";

  // Instagram・X・TikTok は投稿1件ずつ見せるため、最新の投稿を読む(読めなければアカウントの表示)
  // 新着・ギャラリー・カレンダーの中身をまとめて読む(左右のスワイプはサーバーを待たずにその場で切り替える)
  const social = sources;
  const [items, instagram, x, tiktok, gallery, calendar, manual] = await Promise.all([
    getTimeline({ oshiIds: [active.id] }),
    Promise.all(
      social
        .filter((s) => s.platform === "instagram")
        .map(async (s) => [s.id, await instagramPostCodes(handleOf(s.handle))] as const),
    ).then((pairs) => Object.fromEntries(pairs)),
    Promise.all(
      social.filter((s) => s.platform === "x").map(async (s) => [s.id, await xPosts(handleOf(s.handle))] as const),
    ).then((pairs) => Object.fromEntries(pairs)),
    Promise.all(
      social
        .filter((s) => s.platform === "tiktok")
        .map(async (s) => [s.id, await tiktokVideos(handleOf(s.handle))] as const),
    ).then((pairs) => Object.fromEntries(pairs)),
    getGallery(active.id),
    getCalendar(active.id),
    getManualPosts(active.id),
  ]);
  // 個別に追加した投稿(推しのメニューの「個別投稿の更新」)は、フィードの先頭に並べる
  const pinned: TimelineItem[] = manual.map((post) => ({
    item_id: `m-${post.id}`,
    oshi_id: post.oshi_id,
    source_id: "",
    platform: post.platform,
    title: post.title,
    url: post.url,
    thumbnail_url: post.thumbnail_url,
    published_at: post.created_at,
    read: true,
  }));
  // 保存した投稿(Developer だけ。反応ボタンの短押しで保存・解除する)
  const savedUrls = viewer.plan === "master" ? (await getSavedPosts()).map((p) => p.url) : [];

  return (
    <SwipeFeed
      // 推しが変わったら最初の1枚から見せる
      key={active.id}
      isAdmin={viewer.role === "admin"}
      mode={mode}
      canSensitive={canUseAdvanced(viewer.plan)}
      oshi={ordered}
      active={active}
      unread={unread}
      sources={sources}
      instagram={instagram}
      x={x}
      tiktok={tiktok}
      items={items}
      pageSize={PAGE_SIZE}
      pendingSns={pendingSns}
      view={view}
      gallery={gallery}
      calendar={calendar}
      savedUrls={savedUrls}
      pinned={pinned}
    />
  );
}
