import type { Metadata } from "next";
import { ManageView } from "@/components/manage-view";
import { requireViewer } from "@/lib/auth";
import { getLibrary } from "@/lib/data";
import { getFeedMode } from "@/lib/feed-mode";
import { getPlanLabels } from "@/lib/plan-names";
import { canUseAdvanced } from "@/lib/plans";

export const metadata: Metadata = { title: "推しの登録" };
// まとめて取り込みは外部ページの確認を伴うため、最大60秒まで待つ
export const maxDuration = 60;

// 新着の画面から開く: 推しのアイコンの長押し(?sns=<推しのid>)、推しのメニュー(?sns= / ?edit=<推しのid>)、
// 推しのメニューの「推しを登録」(?new=1)
export default async function ManagePage({ searchParams }: { searchParams: Promise<{ sns?: string; new?: string; edit?: string }> }) {
  const [params, viewer, library, labels] = await Promise.all([searchParams, requireViewer(), getLibrary(), getPlanLabels()]);
  const mode = await getFeedMode(viewer);
  return (
    <ManageView
      viewer={viewer}
      {...library}
      initialSns={params.sns && library.oshi.some((o) => o.id === params.sns) ? params.sns : undefined}
      initialNew={params.new === "1"}
      initialEdit={params.edit && library.oshi.some((o) => o.id === params.edit) ? params.edit : undefined}
      mode={mode}
      canSensitive={canUseAdvanced(viewer.plan)}
      sensitiveName={labels.advanced}
    />
  );
}
