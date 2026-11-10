import type { ReactNode } from "react";
import { Wordmark } from "@/components/header";
import { ThemeSwitch } from "@/components/theme-switch";

// ログイン・二段階認証・案内など、1枚もののページの共通枠
export function AuthFrame({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1080px] flex-col px-5">
      <header className="flex h-14 items-center justify-between">
        <Wordmark />
        <ThemeSwitch />
      </header>
      <main className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[400px] rounded-2xl border border-line bg-surface p-7">
          <h1 className="text-xl leading-7 font-bold">{title}</h1>
          {lead ? <p className="mt-2 text-sm leading-6 text-muted">{lead}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
