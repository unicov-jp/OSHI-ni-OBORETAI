"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/dialog";
import { Button, Notice } from "@/components/ui";
import { refetchFeed, setFeedStatus, setPlan, setSuspended } from "@/lib/actions/admin";
import { PLAN_LABEL, type PlanLabels } from "@/lib/plans";
import type { ActionResult, AdminFeed, AdminUser, Plan } from "@/lib/types";

const PLANS: Plan[] = ["master", "advanced", "paid", "free"];

// 省略されたセルの全文を確認するボタン
export function DetailButton({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        全文
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        <p className="text-sm leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</p>
      </Dialog>
    </>
  );
}

function useAction() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const run = (action: () => Promise<ActionResult<unknown>>, done: string, after?: () => void) => {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setMessage({ tone: "danger", text: result.error });
      setMessage({ tone: "ok", text: done });
      after?.();
    });
  };
  return { pending, message, run };
}

export function UserActions({ user, selfId, labels = PLAN_LABEL }: { user: AdminUser; selfId: string; labels?: PlanLabels }) {
  const [open, setOpen] = useState(false);
  const { pending, message, run } = useAction();
  const isSelf = user.id === selfId;
  const suspended = user.suspended_at !== null;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        操作
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={user.email}>
        <div className="space-y-4">
          <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="text-muted">メール</dt>
            <dd className="[overflow-wrap:anywhere]">{user.email}</dd>
            <dt className="text-muted">登録数</dt>
            <dd className="num">
              推し {user.oshi_count}人、アカウント {user.source_count}件
            </dd>
          </dl>
          <p className="text-xs text-muted">利用者が誰を推しているかは、運営者にも表示されません。</p>
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          {isSelf ? (
            <Notice>自分自身の停止・プラン変更はできません。</Notice>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={suspended ? "secondary" : "danger"}
                disabled={pending}
                onClick={() =>
                  run(() => setSuspended(user.id, !suspended), suspended ? "利用を再開しました" : "利用を停止しました")
                }
              >
                {suspended ? "利用を再開する" : "利用を停止する"}
              </Button>
              {PLANS.filter((p) => p !== user.plan).map((p) => (
                <Button key={p} disabled={pending} onClick={() => run(() => setPlan(user.id, p), `${labels[p]}にしました`)}>
                  {labels[p]}にする
                </Button>
              ))}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

export function FeedActions({ feed }: { feed: AdminFeed }) {
  const [open, setOpen] = useState(false);
  const { pending, message, run } = useAction();
  const running = feed.status === "active";

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        操作
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={feed.title || feed.feed_url}>
        <div className="space-y-4">
          <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="text-muted">取得先</dt>
            <dd className="[overflow-wrap:anywhere]">{feed.feed_url}</dd>
            <dt className="text-muted">連続失敗</dt>
            <dd className="num">{feed.error_count}回</dd>
            <dt className="text-muted">直近のエラー</dt>
            <dd className="[overflow-wrap:anywhere]">{feed.last_error ?? "なし"}</dd>
          </dl>
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={pending} onClick={() => run(() => refetchFeed(feed.id), "取得しました")}>
              {pending ? "処理中" : "今すぐ取得する"}
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => setFeedStatus(feed.id, running ? "paused" : "active"),
                  running ? "取得を止めました" : "取得を再開しました",
                )
              }
            >
              {running ? "取得を止める" : "取得を再開する"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
