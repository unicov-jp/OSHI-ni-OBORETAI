"use client";

import { useState, useTransition } from "react";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { updateDisplayName } from "@/lib/actions/account";
import { openPortal, startCheckout } from "@/lib/actions/billing";

export function DisplayNameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await updateDisplayName(name);
          setMessage(result.ok ? { tone: "ok", text: "保存しました" } : { tone: "danger", text: result.error });
        });
      }}
    >
      <Field label="表示名">
        <input
          className={`${inputClass} max-w-[320px]`}
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button type="submit" disabled={pending || name === initial}>
        表示名を保存
      </Button>
    </form>
  );
}

export function BillingButtons({ isPro, enabled }: { isPro: boolean; enabled: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: typeof startCheckout) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && !result.ok) setError(result.error);
    });
  };

  if (!enabled) {
    return <p className="text-sm text-muted">現在、Proプランの申し込みは受け付けていません。</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {isPro ? (
        <Button onClick={() => run(openPortal)} disabled={pending}>
          支払い方法の変更・解約
        </Button>
      ) : (
        <Button variant="primary" onClick={() => run(startCheckout)} disabled={pending}>
          Proプランに申し込む
        </Button>
      )}
    </div>
  );
}
