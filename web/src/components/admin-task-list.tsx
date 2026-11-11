"use client";

import { useState, useTransition } from "react";
import { Button, inputClass, Notice, formatDateTime } from "@/components/ui";
import { addAdminTask, deleteAdminTask, setAdminTaskDone, updateAdminTask, type AdminTask } from "@/lib/actions/admin-tasks";

export function AdminTaskList({ tasks }: { tasks: AdminTask[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", detail: "" });

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) return setError(result.error ?? "できませんでした");
      after?.();
    });
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  const row = (task: AdminTask) => (
    <li key={task.id} className="flex gap-3 px-4 py-3">
      <input
        type="checkbox"
        checked={task.done}
        disabled={pending}
        onChange={(e) => run(() => setAdminTaskDone(task.id, e.target.checked))}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--brand)]"
        aria-label={task.done ? "未完了に戻す" : "完了にする"}
      />
      {editing === task.id ? (
        <div className="min-w-0 flex-1 space-y-2">
          <input className={inputClass} value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <textarea className={`${inputClass} h-24 py-2`} value={draft.detail} maxLength={2000} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={pending} onClick={() => run(() => updateAdminTask(task.id, draft), () => setEditing(null))}>
              保存
            </Button>
            <Button size="sm" disabled={pending} onClick={() => setEditing(null)}>
              やめる
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <p className={`text-[15px] font-semibold ${task.done ? "text-muted line-through" : ""}`}>{task.title}</p>
          {task.detail ? <p className="mt-1 text-[13px] leading-6 whitespace-pre-wrap text-muted [overflow-wrap:anywhere]">{task.detail}</p> : null}
          <p className="num mt-1 text-[11px] text-muted">
            追加 {formatDateTime(task.created_at).slice(0, 10)}
            {task.done_at ? `・完了 ${formatDateTime(task.done_at).slice(0, 10)}` : ""}
          </p>
          <div className="mt-2 flex gap-3 text-[13px]">
            <button
              type="button"
              className="text-muted underline hover:text-text"
              onClick={() => {
                setEditing(task.id);
                setDraft({ title: task.title, detail: task.detail });
              }}
            >
              編集
            </button>
            <button
              type="button"
              className="text-danger underline"
              disabled={pending}
              onClick={() => {
                if (window.confirm(`「${task.title}」を削除しますか？`)) run(() => deleteAdminTask(task.id));
              }}
            >
              削除
            </button>
          </div>
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-5">
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <form
        className="space-y-2 rounded-xl border border-line bg-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          run(() => addAdminTask({ title, detail }), () => {
            setTitle("");
            setDetail("");
          });
        }}
      >
        <p className="text-[15px] font-semibold">残作業を追加</p>
        <input className={inputClass} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="見出し(例: Stripe の Webhook)" />
        <textarea className={`${inputClass} h-20 py-2`} value={detail} maxLength={2000} onChange={(e) => setDetail(e.target.value)} placeholder="詳しい内容(任意)" />
        <button type="submit" disabled={pending || !title.trim()} className="h-10 rounded-lg bg-brand px-4 text-sm font-bold text-brand-ink disabled:opacity-50">
          追加
        </button>
      </form>

      <section>
        <h2 className="mb-2 text-[15px] font-bold">未完了</h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted">残作業はありません</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{open.map(row)}</ul>
        )}
      </section>

      {done.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[15px] font-bold">完了</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-surface">{done.map(row)}</ul>
        </section>
      ) : null}
    </div>
  );
}
