"use client";

import { useState, useTransition } from "react";
import { Button, buttonClass, Notice } from "@/components/ui";
import { disconnectDrive } from "@/lib/actions/drive";

// Googleドライブの接続(写真の保存先)。接続は Google の許可の画面へ移って行う
export function DrivePanel({ connected, available }: { connected: boolean; available: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Googleドライブ</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            写真は Google ドライブの「推しに溺れたいapp」フォルダに保存します。
          </p>
        </div>
        <span className={`shrink-0 text-xs font-bold ${connected ? "text-ok" : "text-muted"}`}>{connected ? "接続中" : "未接続"}</span>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {!available ? (
        <p className="text-xs text-muted">ただいま準備中です。</p>
      ) : connected ? (
        confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="w-full text-xs text-muted">解除しても、ドライブに保存した写真は消えません。解除中は写真を表示・保存できません。</p>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await disconnectDrive();
                  if (!result.ok) setError(result.error);
                  setConfirming(false);
                })
              }
            >
              {pending ? "解除中" : "解除する"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              やめる
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <a href="/api/drive/connect" className={buttonClass("secondary", "sm")}>
              接続し直す
            </a>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
              接続を解除
            </Button>
          </div>
        )
      ) : (
        <a href="/api/drive/connect" className={buttonClass("primary", "sm")}>
          Googleドライブに接続
        </a>
      )}
    </div>
  );
}
