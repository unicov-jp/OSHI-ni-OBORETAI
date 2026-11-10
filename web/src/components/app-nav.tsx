"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; exact?: boolean };

function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

// PC: ヘッダー内の横並びナビ
export function TopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="メイン" className="hidden items-center gap-1 md:flex">
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap ${
              active ? "bg-sunken text-text" : "text-muted hover:bg-sunken hover:text-text"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

// スマホ: 画面下に固定するナビ。項目は等幅。
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="メイン"
      className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(56px+env(safe-area-inset-bottom))] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-1 text-xs font-medium ${
              active ? "text-brand" : "text-muted"
            }`}
          >
            <span className={`h-1 w-6 rounded-full ${active ? "bg-brand" : "bg-transparent"}`} />
            <span className="clamp-1 max-w-full px-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// 管理画面: 左のサイドナビ(PC)と上部の横スクロールナビ(スマホ)
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="管理" className="grid gap-1 md:flex md:flex-col" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 items-center justify-center rounded-lg px-3 text-sm font-medium whitespace-nowrap md:justify-start ${
              active ? "bg-brand/15 text-brand" : "text-muted hover:bg-sunken hover:text-text"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
