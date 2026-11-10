import type { Metadata } from "next";
import { ManageView } from "@/components/manage-view";
import { requireViewer } from "@/lib/auth";
import { getLibrary } from "@/lib/data";

export const metadata: Metadata = { title: "推しの登録" };
// まとめて取り込みは外部ページの確認を伴うため、最大60秒まで待つ
export const maxDuration = 60;

// 新着の画面から開く: 推しのアイコンの長押し(?sns=<推しのid>)、推しのメニュー(?sns= / ?edit=<推しのid>)、
// 設定・管理ボタンの長押し(?new=1)
export default async function ManagePage({ searchParams }: { searchParams: Promise<{ sns?: string; new?: string; edit?: string }> }) {
  const [params, viewer, library] = await Promise.all([searchParams, requireViewer(), getLibrary()]);
  return (
    <ManageView
      viewer={viewer}
      {...library}
      initialSns={params.sns && library.oshi.some((o) => o.id === params.sns) ? params.sns : undefined}
      initialNew={params.new === "1"}
      initialEdit={params.edit && library.oshi.some((o) => o.id === params.edit) ? params.edit : undefined}
    />
  );
}
