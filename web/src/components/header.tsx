import Link from "next/link";
import { TopNav, type NavItem } from "@/components/app-nav";
import { ThemeSwitch } from "@/components/theme-switch";
import { Badge } from "@/components/ui";
import type { Viewer } from "@/lib/types";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="font-display shrink-0 text-[17px] leading-none tracking-wide whitespace-nowrap text-text">
      推しに溺れたい
    </Link>
  );
}

// 全画面共通のヘッダー。高さは固定(56px)。
export function Header({ viewer, items, home }: { viewer: Viewer; items: NavItem[]; home: string }) {
  const name = viewer.displayName || viewer.email;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
        <Wordmark href={home} />
        {viewer.isDemo ? <Badge tone="warn">デモ表示</Badge> : null}
        <TopNav items={items} />
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <ThemeSwitch />
          <span className="clamp-1 hidden max-w-[160px] text-[13px] text-muted lg:block" title={name}>
            {name}
          </span>
          <form action="/auth/signout" method="post" className="hidden md:block">
            <button
              type="submit"
              className="h-10 rounded-lg px-3 text-[13px] whitespace-nowrap text-muted hover:bg-sunken hover:text-text"
            >
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
