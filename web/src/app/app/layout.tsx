import { Header } from "@/components/header";
import { requireViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 画面の切り替えはタブではなく、新着の画面の右側のボタン(設定・管理)から行う。
// 設定・管理の画面には「新着に戻る」を置く。
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();

  return (
    <>
      <Header viewer={viewer} items={[]} home="/app" />
      <div className="mx-auto max-w-[1400px] px-4 pt-5 pb-[calc(24px+env(safe-area-inset-bottom))] md:pb-10">{children}</div>
    </>
  );
}
