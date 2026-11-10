import type { Metadata } from "next";
import Link from "next/link";
import { Badge, formatDateTime } from "@/components/ui";
import { getAdminStats, getFetchLogs } from "@/lib/data";

export const metadata: Metadata = { title: "概要" };

const YOUTUBE_DAILY_QUOTA = 10000;

function Tile({ label, value, note, tone }: { label: string; value: number; note?: string; tone?: "danger" }) {
  return (
    <div className="flex h-[104px] flex-col justify-between rounded-xl border border-line bg-surface p-4">
      <p className="clamp-1 text-[13px] text-muted">{label}</p>
      <p className={`num text-[26px] leading-none font-bold ${tone === "danger" && value > 0 ? "text-danger" : ""}`}>
        {value.toLocaleString("ja-JP")}
      </p>
      <p className="clamp-1 text-xs text-muted">{note ?? ""}</p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  const [stats, failures] = await Promise.all([getAdminStats(), getFetchLogs(true)]);
  const total = stats.fetch_ok_24h + stats.fetch_ng_24h;
  const failureRate = total > 0 ? ((stats.fetch_ng_24h / total) * 100).toFixed(1) : "0.0";
  const quota = Math.min(100, (stats.youtube_units_today / YOUTUBE_DAILY_QUOTA) * 100);

  return (
    <div className="space-y-6">
      <h1 className="text-xl leading-7 font-bold">概要</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="利用者" value={stats.users} note={`直近7日で ${stats.users_7d}人`} />
        <Tile label="有料プラン" value={stats.paid} note={`停止中の利用者 ${stats.suspended}人`} />
        <Tile label="登録された推し" value={stats.oshi} note={`アカウント ${stats.sources.toLocaleString("ja-JP")}件`} />
        <Tile label="24時間の新着" value={stats.items_24h} />
        <Tile label="取得中の取得元" value={stats.feeds_active} note={`停止中 ${stats.feeds_paused}件`} />
        <Tile label="エラーで止まった取得元" value={stats.feeds_error} tone="danger" note="8回連続で失敗すると止まります" />
        <Tile label="24時間の取得失敗" value={stats.fetch_ng_24h} tone="danger" note={`失敗率 ${failureRate}%`} />
        <Tile label="24時間の取得成功" value={stats.fetch_ok_24h} />
      </div>

      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">YouTube APIの本日の使用量</h2>
          <p className="num text-sm text-muted">
            {stats.youtube_units_today.toLocaleString("ja-JP")} / {YOUTUBE_DAILY_QUOTA.toLocaleString("ja-JP")} ユニット
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunken">
          <div
            className={`h-full rounded-full ${quota >= 80 ? "bg-danger" : "bg-brand"}`}
            style={{ width: `${quota}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">
          既定の上限は1日10,000ユニット(太平洋時間の0時にリセット)。上限を超えるとYouTubeの新着取得が止まります。
        </p>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">直近の取得失敗</h2>
          <Link href="/admin/logs?only=failed" className="text-[13px] text-brand underline">
            すべて見る
          </Link>
        </div>
        <div className="scroll-x rounded-xl border border-line bg-surface">
          <table className="data-table min-w-[640px] text-sm">
            <colgroup>
              <col className="w-[150px]" />
              <col className="w-[32%]" />
              <col />
              <col className="w-[72px]" />
            </colgroup>
            <thead>
              <tr>
                <th>日時</th>
                <th>取得元</th>
                <th>エラー</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {failures.slice(0, 6).map((log) => (
                <tr key={log.id}>
                  <td className="num">{formatDateTime(log.created_at)}</td>
                  <td title={log.feed_title}>{log.feed_title || "(削除済み)"}</td>
                  <td title={log.error ?? ""}>{log.error}</td>
                  <td>
                    <Badge tone="danger">失敗</Badge>
                  </td>
                </tr>
              ))}
              {failures.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted">
                    直近の失敗はありません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
