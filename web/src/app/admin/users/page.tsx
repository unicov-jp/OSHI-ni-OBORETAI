import type { Metadata } from "next";
import Link from "next/link";
import { UserActions } from "@/components/admin-actions";
import { Badge, buttonClass, formatDateTime, inputClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getAdminUsers } from "@/lib/data";

export const metadata: Metadata = { title: "利用者" };

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const search = (params.q ?? "").trim().slice(0, 100);
  const page = Math.max(0, Number.parseInt(params.page ?? "0", 10) || 0);
  const [viewer, users] = await Promise.all([requireAdmin(), getAdminUsers(search, page)]);
  const pageHref = (n: number) => `/admin/users?${new URLSearchParams({ q: search, page: String(n) })}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl leading-7 font-bold">利用者</h1>

      <form className="flex max-w-[480px] gap-2" action="/admin/users">
        <input
          name="q"
          defaultValue={search}
          className={inputClass}
          placeholder="メールアドレスまたは表示名で探す"
          aria-label="利用者を探す"
        />
        <button type="submit" className={buttonClass("secondary")}>
          検索
        </button>
      </form>

      <div className="scroll-x rounded-xl border border-line bg-surface">
        <table className="data-table min-w-[860px] text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col />
            <col className="w-[72px]" />
            <col className="w-[88px]" />
            <col className="w-[88px]" />
            <col className="w-[110px]" />
            <col className="w-[150px]" />
            <col className="w-[76px]" />
          </colgroup>
          <thead>
            <tr>
              <th>表示名</th>
              <th>メール</th>
              <th>プラン</th>
              <th>権限</th>
              <th>状態</th>
              <th>推し / 件数</th>
              <th>登録日時</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td title={user.display_name}>{user.display_name || "未設定"}</td>
                <td title={user.email}>{user.email}</td>
                <td>
                  <Badge tone={user.plan === "pro" ? "brand" : "neutral"}>{user.plan === "pro" ? "Pro" : "無料"}</Badge>
                </td>
                <td>
                  <Badge tone={user.role === "admin" ? "warn" : "neutral"}>{user.role === "admin" ? "運営者" : "利用者"}</Badge>
                </td>
                <td>
                  <Badge tone={user.suspended_at ? "danger" : "ok"}>{user.suspended_at ? "停止中" : "利用中"}</Badge>
                </td>
                <td className="num">
                  {user.oshi_count} / {user.source_count}
                </td>
                <td className="num">{formatDateTime(user.created_at)}</td>
                <td>
                  <UserActions user={user} selfId={viewer.id} />
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-muted">
                  該当する利用者がいません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

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
