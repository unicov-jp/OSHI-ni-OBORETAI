"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { setPlanNames } from "@/lib/actions/admin";
import type { PlanLabels } from "@/lib/plans";

const ROWS: { plan: keyof PlanLabels; note: string }[] = [
  { plan: "free", note: "推し3人まで" },
  { plan: "paid", note: "料金を払っている利用者" },
  { plan: "advanced", note: "Fantia・myfans・xfans・FANZA も使える利用者" },
  { plan: "master", note: "運営者(管理画面を使える)" },
];

// プラン名の入力。設定画面・料金ページ・管理画面の表示に使う
export function PlanNameEditor({ initial }: { initial: PlanLabels }) {
  const router = useRouter();
  const [names, setNames] = useState<PlanLabels>(initial);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      {ROWS.map((row) => (
        <Field key={row.plan} label={`${row.note}`}>
          <input
            className={inputClass}
            value={names[row.plan]}
            maxLength={20}
            onChange={(e) => setNames({ ...names, [row.plan]: e.target.value })}
          />
        </Field>
      ))}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button
        variant="primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await setPlanNames(names);
            if (!result.ok) return setMessage({ tone: "danger", text: result.error });
            setMessage({ tone: "ok", text: "保存しました" });
            router.refresh();
          })
        }
      >
        {pending ? "保存中" : "プラン名を保存"}
      </Button>
    </div>
  );
}
