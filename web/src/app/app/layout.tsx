import { BottomNav, type NavItem } from "@/components/app-nav";
import { Header } from "@/components/header";
import { requireViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();

  const items: NavItem[] = [
    { href: "/app", label: "新着", exact: true },
    { href: "/app/manage", label: "推しの登録" },
    { href: "/app/settings", label: "設定" },
  ];
  if (viewer.role === "admin") items.push({ href: "/admin", label: "管理" });

  return (
    <>
      <Header viewer={viewer} items={items} home="/app" />
      <div className="mx-auto max-w-[1400px] px-4 pt-5 pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-10">
        {children}
      </div>
      <BottomNav items={items} />
    </>
  );
}
