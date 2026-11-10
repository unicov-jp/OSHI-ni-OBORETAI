"use client";

import { useState, useTransition } from "react";
import { SettingSwitch } from "@/components/setting-switch";
import { Button, Notice } from "@/components/ui";
import { disconnectDrive } from "@/lib/actions/drive";

// Googleドライブの接続(写真の保存先)。スイッチを ON にすると Google の許可の画面へ移り、OFF にすると解除の確認を出す
export function DrivePanel({ connected, available }: { connected: boolean; available: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <SettingSwitch
        title="Googleドライブ"
        status={connected ? "接続中" : "未接続"}
        on={connected || moving}
        description={available ? "写真は Google ドライブの「推しに溺れたいapp」フォルダに保存します。" : "ただいま準備中です。"}
        disabled={!available || pending || moving}
        onToggle={() => {
          if (connected) return setConfirming(true);
          setMoving(true);
          // サーバーの処理(/api)を経て Google の画面へ移るので、画面ごと読み替える
          window.location.assign(new URL("/api/drive/connect", window.location.origin));
        }}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {confirming ? (
        <div className="space-y-2 rounded-lg border border-line p-3">
          <p className="text-xs text-muted">解除しても、ドライブに保存した写真は消えません。解除中は写真を表示・保存できません。</p>
          <div className="flex flex-wrap gap-2">
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
              {pending ? "解除中" : "OFFにする(解除)"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              やめる
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
