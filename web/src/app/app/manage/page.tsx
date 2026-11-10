import type { Metadata } from "next";
import { ManageView } from "@/components/manage-view";
import { requireViewer } from "@/lib/auth";
import { getLibrary } from "@/lib/data";

export const metadata: Metadata = { title: "推しの登録" };
// まとめて取り込みは外部ページの確認を伴うため、最大60秒まで待つ
export const maxDuration = 60;

// 新着の画面から、推しのアイコンの長押し(?sns=<推しのid>)・更新ボタンの長押し(?new=1)で開く
export default async function ManagePage({ searchParams }: { searchParams: Promise<{ sns?: string; new?: string }> }) {
  const [params, viewer, library] = await Promise.all([searchParams, requireViewer(), getLibrary()]);
  return (
    <ManageView
      viewer={viewer}
      {...library}
      initialSns={params.sns && library.oshi.some((o) => o.id === params.sns) ? params.sns : undefined}
      initialNew={params.new === "1"}
    />
  );
}
