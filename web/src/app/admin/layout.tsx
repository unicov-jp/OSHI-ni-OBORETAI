import type { Metadata } from "next";
import { SideNav } from "@/components/app-nav";
import { Header } from "@/components/header";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "管理", template: "%s | 管理 | 推しに溺れたい" } };

const NAV = [
  { href: "/admin", label: "概要", exact: true },
  { href: "/admin/users", label: "利用者" },
  { href: "/admin/feeds", label: "取得元" },
  { href: "/admin/logs", label: "ログ" },
  // マスターは新着の画面に「管理」だけが出るので、設定はここから開く
  { href: "/app/settings", label: "設定" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireAdmin();

  return (
    <>
      <Header viewer={viewer} items={[{ href: "/app", label: "新着に戻る" }]} home="/admin" />
      <div className="mx-auto max-w-[1400px] px-4 py-5 md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-6">
        <aside className="mb-4 md:mb-0">
          <p className="mb-2 hidden px-3 text-xs font-semibold text-muted md:block">運営者向け管理画面</p>
          <SideNav items={NAV} />
          <a href="/app" className="mt-2 block px-3 text-[13px] text-muted underline md:hidden">
            新着に戻る
          </a>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </>
  );
}
