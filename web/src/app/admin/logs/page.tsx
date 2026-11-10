import type { Metadata } from "next";
import Link from "next/link";
import { DetailButton } from "@/components/admin-actions";
import { Badge, formatDateTime } from "@/components/ui";
import { getAuditLogs, getFetchLogs } from "@/lib/data";

export const metadata: Metadata = { title: "ログ" };

const ACTION_LABEL: Record<string, string> = {
  "user.suspend": "利用者を停止",
  "user.resume": "利用者を再開",
  "user.role": "権限を変更",
  "feed.status": "取得元の状態を変更",
  "feed.refetch": "取得元を手動取得",
  "user.plan": "プランを変更",
  "price.tiers": "料金を変更",
  "price.per_oshi": "料金(1人あたり)を変更",
  "plan.names": "プラン名を変更",
};

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; only?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "audit" ? "audit" : "fetch";
  const onlyFailed = params.only === "failed";

  const tabs = [
    { id: "fetch", label: "取得ログ", href: "/admin/logs" },
    { id: "audit", label: "操作ログ", href: "/admin/logs?tab=audit" },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl leading-7 font-bold">ログ</h1>

      <nav aria-label="ログの種類" className="flex gap-2">
        {tabs.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            aria-current={item.id === tab ? "true" : undefined}
            className={`flex h-9 w-[104px] items-center justify-center rounded-full border text-[13px] font-medium ${
              item.id === tab ? "border-text bg-text text-bg" : "border-line bg-surface text-muted hover:text-text"
            }`}
          >
            {item.label}
          </Link>
        ))}
        {tab === "fetch" ? (
          <Link
            href={onlyFailed ? "/admin/logs" : "/admin/logs?only=failed"}
            aria-pressed={onlyFailed}
            className={`ml-auto flex h-9 items-center rounded-full border px-4 text-[13px] font-medium whitespace-nowrap ${
              onlyFailed ? "border-danger text-danger" : "border-line text-muted hover:text-text"
            }`}
          >
            失敗だけ表示
          </Link>
        ) : null}
      </nav>

      {tab === "fetch" ? <FetchTable onlyFailed={onlyFailed} /> : <AuditTable />}
      <p className="text-xs text-muted">直近100件を表示しています。取得ログは30日で自動的に削除されます。</p>
    </div>
  );
}

async function FetchTable({ onlyFailed }: { onlyFailed: boolean }) {
  const logs = await getFetchLogs(onlyFailed);
  return (
    <div className="scroll-x rounded-xl border border-line bg-surface">
      <table className="data-table min-w-[860px] text-sm">
        <colgroup>
          <col className="w-[150px]" />
          <col className="w-[26%]" />
          <col className="w-[72px]" />
          <col className="w-[96px]" />
          <col className="w-[80px]" />
          <col />
          <col className="w-[72px]" />
        </colgroup>
        <thead>
          <tr>
            <th>日時</th>
            <th>取得元</th>
            <th>結果</th>
            <th>新着 / 件数</th>
            <th>所要時間</th>
            <th>エラー</th>
            <th>全文</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="num">{formatDateTime(log.created_at)}</td>
              <td title={log.feed_title}>{log.feed_title || "(削除済み)"}</td>
              <td>
                <Badge tone={log.ok ? "ok" : "danger"}>{log.ok ? "成功" : "失敗"}</Badge>
              </td>
              <td className="num">
                {log.items_added} / {log.items_found}
              </td>
              <td className="num">{log.duration_ms.toLocaleString("ja-JP")}ms</td>
              <td title={log.error ?? ""} className={log.error ? "text-danger" : "text-muted"}>
                {log.error ?? "なし"}
              </td>
              <td>{log.error ? <DetailButton title={log.feed_title || "エラー"} text={log.error} /> : null}</td>
            </tr>
          ))}
          {logs.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-muted">
                ログはまだありません
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

async function AuditTable() {
  const logs = await getAuditLogs();
  return (
    <div className="scroll-x rounded-xl border border-line bg-surface">
      <table className="data-table min-w-[760px] text-sm">
        <colgroup>
          <col className="w-[150px]" />
          <col className="w-[26%]" />
          <col className="w-[180px]" />
          <col />
          <col className="w-[120px]" />
        </colgroup>
        <thead>
          <tr>
            <th>日時</th>
            <th>運営者</th>
            <th>操作</th>
            <th>対象</th>
            <th>内容</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="num">{formatDateTime(log.created_at)}</td>
              <td title={log.admin_email}>{log.admin_email}</td>
              <td>{ACTION_LABEL[log.action] ?? log.action}</td>
              <td title={log.target}>{log.target}</td>
              <td title={log.detail}>{log.detail}</td>
            </tr>
          ))}
          {logs.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-muted">
                操作ログはまだありません
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
