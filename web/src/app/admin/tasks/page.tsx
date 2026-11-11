import type { Metadata } from "next";
import { AdminTaskList } from "@/components/admin-task-list";
import { getAdminTasks } from "@/lib/actions/admin-tasks";

export const metadata: Metadata = { title: "残作業" };
export const dynamic = "force-dynamic";

// 運営者向け: アプリの残作業の一覧。追加・完了・編集・削除ができる
export default async function AdminTasksPage() {
  const tasks = await getAdminTasks();
  const open = tasks.filter((t) => !t.done).length;
  return (
    <div className="max-w-[760px] space-y-4">
      <div>
        <h1 className="text-xl leading-7 font-bold">残作業</h1>
        <p className="mt-1 text-sm text-muted">
          未完了 <span className="num font-semibold text-text">{open}</span> 件。終わったらチェックを入れると、下の「完了」に移ります。
        </p>
      </div>
      <AdminTaskList tasks={tasks} />
    </div>
  );
}
