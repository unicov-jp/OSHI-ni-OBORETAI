import type { Metadata } from "next";
import Link from "next/link";
import { UserActions } from "@/components/admin-actions";
import { Badge, buttonClass, formatDateTime, inputClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getPlanLabels } from "@/lib/plan-names";
import { billingLabel } from "@/lib/plans";
import { getAdminUsers } from "@/lib/data";
import type { AdminUser } from "@/lib/types";

export const metadata: Metadata = { title: "利用者" };

// 利用者の一覧: メール・プラン・決済状況(Stripe)・状態。表示名は出さない。
// スマホではカード、広い画面では表で見せる

function planTone(plan: AdminUser["plan"]) {
  return plan === "master" ? "warn" : plan === "paid" ? "brand" : "neutral";
}

// 決済状況と、次の更新日(解約済みなら利用できる最終日)
function Billing({ user }: { user: AdminUser }) {
  const label = billingLabel(user.plan, user.billing_status);
  const end = user.plan !== "master" && user.billing_period_end ? formatDateTime(user.billing_period_end).slice(0, 10) : "";
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge tone={label.tone}>{label.text}</Badge>
      {end ? (
        <span className="num text-[11px] text-muted">
          {user.billing_status === "canceled" ? "終了" : "次回"} {end}
        </span>
      ) : null}
    </span>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  const [viewer, users, labels] = await Promise.all([requireAdmin(), getAdminUsers(search, page), getPlanLabels()]);
  const pageHref = (n: number) => `/admin/users?${new URLSearchParams({ q: search, page: String(n) })}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl leading-7 font-bold">利用者</h1>

      <form className="flex max-w-[480px] gap-2" action="/admin/users">
        <input
          name="q"
          defaultValue={search}
          className={inputClass}
          placeholder="メールアドレスで探す"
          aria-label="利用者を探す"
        />
        <button type="submit" className={buttonClass("secondary")}>
          検索
        </button>
      </form>

      {users.length === 0 ? <p className="text-sm text-muted">該当する利用者がいません</p> : null}

      {/* スマホ: カード */}
      <ul className="space-y-3 md:hidden">
        {users.map((user) => (
          <li key={user.id} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold [overflow-wrap:anywhere]">{user.email}</p>
            <dl className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] items-center gap-y-2 text-sm">
              <dt className="text-xs text-muted">プラン</dt>
              <dd>
                <Badge tone={planTone(user.plan)}>{labels[user.plan]}</Badge>
              </dd>
              <dt className="text-xs text-muted">決済</dt>
              <dd>
                <Billing user={user} />
              </dd>
              <dt className="text-xs text-muted">状態</dt>
              <dd>
                <Badge tone={user.suspended_at ? "danger" : "ok"}>{user.suspended_at ? "停止中" : "利用中"}</Badge>
              </dd>
              <dt className="text-xs text-muted">登録数</dt>
              <dd className="num text-[13px]">
                推し {user.oshi_count}人・SNS {user.source_count}件
              </dd>
              <dt className="text-xs text-muted">登録日</dt>
              <dd className="num text-[13px]">{formatDateTime(user.created_at)}</dd>
            </dl>
            <div className="mt-3 flex justify-end">
              <UserActions user={user} selfId={viewer.id} labels={labels} />
            </div>
          </li>
        ))}
      </ul>

      {/* 広い画面: 表 */}
      {users.length > 0 ? (
        <div className="scroll-x hidden rounded-xl border border-line bg-surface md:block">
          <table className="data-table min-w-[860px] text-sm">
            <colgroup>
              <col />
              <col className="w-[84px]" />
              <col className="w-[130px]" />
              <col className="w-[88px]" />
              <col className="w-[110px]" />
              <col className="w-[150px]" />
              <col className="w-[76px]" />
            </colgroup>
            <thead>
              <tr>
                <th>メール</th>
                <th>プラン</th>
                <th>決済状況</th>
                <th>状態</th>
                <th>推し / SNS</th>
                <th>登録日時</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td title={user.email}>{user.email}</td>
                  <td>
                    <Badge tone={planTone(user.plan)}>{labels[user.plan]}</Badge>
                  </td>
                  <td>
                    <Billing user={user} />
                  </td>
                  <td>
                    <Badge tone={user.suspended_at ? "danger" : "ok"}>{user.suspended_at ? "停止中" : "利用中"}</Badge>
                  </td>
                  <td className="num">
                    {user.oshi_count} / {user.source_count}
                  </td>
                  <td className="num">{formatDateTime(user.created_at)}</td>
                  <td>
                    <UserActions user={user} selfId={viewer.id} labels={labels} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex gap-2">
        {page > 0 ? (
          <Link href={pageHref(page - 1)} className={buttonClass("secondary", "sm")}>
            前の50件
          </Link>
        ) : null}
        {users.length >= 50 ? (
          <Link href={pageHref(page + 1)} className={buttonClass("secondary", "sm")}>
            次の50件
          </Link>
        ) : null}
      </div>
    </div>
  );
}
