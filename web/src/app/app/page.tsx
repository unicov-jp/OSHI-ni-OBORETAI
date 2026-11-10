import type { Metadata } from "next";
import Link from "next/link";
import { SwipeFeed, type FeedView } from "@/components/swipe-feed";
import { EmptyState, buttonClass } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { getLatestByOshi, getLibrary, getTimeline, getUnreadCounts, PAGE_SIZE } from "@/lib/data";
import { instagramPostCodes } from "@/lib/fetchers/instagram";
import { tiktokVideos } from "@/lib/fetchers/tiktok";
import { xPosts } from "@/lib/fetchers/x";
import { getCalendar, getGallery } from "@/lib/memories";

export const metadata: Metadata = { title: "TOP" };

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
  // 上部の推しのアイコンは、新着が新しく届いた推しから順に並べる(新着がまだ無い推しは、登録の順で後ろに)
  const ordered = library.oshi
    .map((o, index) => ({ o, index, at: latest[o.id] ?? "" }))
    .sort((a, b) => (a.at === b.at ? a.index - b.index : a.at < b.at ? 1 : -1))
    .map((x) => x.o);

  if (library.oshi.length === 0) {
    return (
      <EmptyState
        title="推しがまだ登録されていません"
        body="今のアプリ(推し活手帳)で推しを登録すると、ここに推しごとの新着が並びます。"
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
  const [items, instagram, x, tiktok, gallery, calendar] = await Promise.all([
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
  ]);

  return (
    <SwipeFeed
      // 推しが変わったら最初の1枚から見せる
      key={active.id}
      isAdmin={viewer.role === "admin"}
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
    />
  );
}
