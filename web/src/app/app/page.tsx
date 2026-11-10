import type { Metadata } from "next";
import { FeedView } from "@/components/feed-view";
import { getLibrary, getTimeline, getUnreadCounts, PAGE_SIZE } from "@/lib/data";
import { PLATFORM_ORDER } from "@/lib/platforms";
import { buildTabs, VIEW_MODES } from "@/lib/tabs";
import type { Platform, ViewMode } from "@/lib/types";

export const metadata: Metadata = { title: "新着" };

type Search = Promise<{ view?: string; tab?: string; p?: string }>;

export default async function FeedPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const view: ViewMode = VIEW_MODES.includes(params.view as ViewMode) ? (params.view as ViewMode) : "oshi";
  const platform: Platform | "all" = PLATFORM_ORDER.includes(params.p as Platform) ? (params.p as Platform) : "all";

  const [library, unread] = await Promise.all([getLibrary(), getUnreadCounts()]);
  const tabs = buildTabs(view, library.oshi, library.categories, unread);
  const activeTab = tabs.find((tab) => tab.id === params.tab) ?? tabs[0];

  const items = await getTimeline({
    oshiIds: activeTab.oshiIds,
    platform: platform === "youtube" || platform === "blog" ? platform : undefined,
  });

  return (
    <FeedView
      // タブや絞り込みが変わったら一覧の状態を作り直す
      key={`${view}:${activeTab.id}:${platform}`}
      view={view}
      tabs={tabs}
      activeTab={activeTab}
      platform={platform}
      oshi={library.oshi}
      sources={library.sources}
      items={items}
      pageSize={PAGE_SIZE}
    />
  );
}
