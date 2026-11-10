import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SavedList } from "@/components/saved-list";
import { requireViewer } from "@/lib/auth";
import { getLibrary, getSavedPosts } from "@/lib/data";

export const metadata: Metadata = { title: "保存した投稿" };

// 保存した投稿の一覧(Developer だけ)。新着の画面の反応ボタンの短押しで保存したもの。期間無制限で残る
export default async function SavedPage() {
  const viewer = await requireViewer();
  if (viewer.plan !== "master") notFound();
  const [posts, library] = await Promise.all([getSavedPosts(), getLibrary()]);
  const names = Object.fromEntries(library.oshi.map((o) => [o.id, o.name]));

  return (
    <div className="mx-auto max-w-[760px] space-y-4 pb-8">
      <div>
        <Link href="/app/settings" className="text-[13px] text-muted hover:text-text">
          ← 設定
        </Link>
        <h1 className="text-xl leading-7 font-bold">保存した投稿</h1>
        <p className="mt-1 text-[13px] text-muted">新着の画面で反応ボタンを短く押すと保存されます。保存した投稿は期間に関係なく残ります。</p>
      </div>
      <SavedList posts={posts.map((p) => ({ ...p, oshiName: names[p.oshi_id] ?? "" }))} />
    </div>
  );
}
