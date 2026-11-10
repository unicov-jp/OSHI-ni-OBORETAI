import type { Metadata } from "next";
import Link from "next/link";
import { SwipeFeed } from "@/components/swipe-feed";
import { EmptyState, buttonClass } from "@/components/ui";
import { getLibrary, getTimeline, getUnreadCounts, PAGE_SIZE } from "@/lib/data";
import { instagramPostCodes } from "@/lib/fetchers/instagram";

export const metadata: Metadata = { title: "新着" };

type Search = Promise<{ tab?: string }>;

// 新着: 推しを1人選び、その推しと所属グループの新着をまとめて上下のスワイプで見る(推し単位のみ)。
export default async function FeedPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const [library, unread] = await Promise.all([getLibrary(), getUnreadCounts()]);

  if (library.oshi.length === 0) {
    return (
      <EmptyState
        title="推しがまだ登録されていません"
        body="今のアプリ(推し活手帳)で推しを登録すると、ここに推しごとの新着が並びます。"
        action={
          <Link href="/app/manage" className={buttonClass("primary")}>
            推しのSNSを見る
          </Link>
        }
      />
    );
  }

  const active = library.oshi.find((o) => o.id === params.tab) ?? library.oshi[0];
  const sources = library.sources.filter((s) => s.oshi_id === active.id);
  // Instagram は投稿1件ずつ見せるため、各アカウントの最新の投稿のコードを読む(読めなければアカウント表示)
  const [items, instagram] = await Promise.all([
    getTimeline({ oshiIds: [active.id] }),
    Promise.all(
      sources
        .filter((s) => s.platform === "instagram")
        .map(async (s) => [s.id, await instagramPostCodes(s.handle.replace(/^@/, ""))] as const),
    ).then((pairs) => Object.fromEntries(pairs)),
  ]);

  return (
    <SwipeFeed
      // 推しが変わったら最初の1枚から見せる
      key={active.id}
      oshi={library.oshi}
      active={active}
      unread={unread}
      sources={sources}
      instagram={instagram}
      items={items}
      pageSize={PAGE_SIZE}
    />
  );
}
