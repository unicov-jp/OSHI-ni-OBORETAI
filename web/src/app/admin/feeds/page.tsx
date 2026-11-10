import type { Metadata } from "next";
import Link from "next/link";
import { FeedActions } from "@/components/admin-actions";
import { Badge, formatDateTime, PlatformTag } from "@/components/ui";
import { getAdminFeeds } from "@/lib/data";

export const metadata: Metadata = { title: "取得元" };

const FILTERS = [
  { value: "", label: "すべて" },
  { value: "error", label: "エラー" },
  { value: "active", label: "取得中" },
  { value: "paused", label: "停止中" },
];

const STATUS = {
  active: { tone: "ok", label: "取得中" },
  paused: { tone: "neutral", label: "停止中" },
  error: { tone: "danger", label: "エラー" },
} as const;

export default async function AdminFeedsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const status = FILTERS.some((f) => f.value === params.status) ? (params.status ?? "") : "";
  const feeds = await getAdminFeeds(status, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl leading-7 font-bold">取得元</h1>
        <p className="mt-1 text-sm text-muted">
          新着を自動で取得しているYouTubeチャンネルとBlogです。同じ取得元を複数の利用者が登録しても、取得は1件にまとめています。
        </p>
      </div>

      <nav aria-label="状態で絞り込む" className="scroll-x flex gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/admin/feeds?status=${filter.value}` : "/admin/feeds"}
            aria-current={filter.value === status ? "true" : undefined}
            className={`flex h-9 w-[88px] shrink-0 items-center justify-center rounded-full border text-[13px] font-medium ${
              filter.value === status ? "border-text bg-text text-bg" : "border-line bg-surface text-muted hover:text-text"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      <div className="scroll-x rounded-xl border border-line bg-surface">
        <table className="data-table min-w-[900px] text-sm">
          <colgroup>
            <col className="w-[100px]" />
            <col className="w-[24%]" />
            <col className="w-[84px]" />
            <col className="w-[84px]" />
            <col className="w-[150px]" />
            <col />
            <col className="w-[76px]" />
          </colgroup>
          <thead>
            <tr>
              <th>種類</th>
              <th>名前</th>
              <th>状態</th>
              <th>登録者</th>
              <th>最終取得</th>
              <th>直近のエラー</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {feeds.map((feed) => (
              <tr key={feed.id}>
                <td>
                  <PlatformTag platform={feed.platform} />
                </td>
                <td title={feed.title || feed.feed_url}>{feed.title || feed.feed_url}</td>
                <td>
                  <Badge tone={STATUS[feed.status].tone}>{STATUS[feed.status].label}</Badge>
                </td>
                <td className="num">{feed.subscribers.toLocaleString("ja-JP")}人</td>
                <td className="num">{formatDateTime(feed.last_fetched_at)}</td>
                <td title={feed.last_error ?? ""} className={feed.last_error ? "text-danger" : "text-muted"}>
                  {feed.last_error ?? "なし"}
                </td>
                <td>
                  <FeedActions feed={feed} />
                </td>
              </tr>
            ))}
            {feeds.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted">
                  該当する取得元がありません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
