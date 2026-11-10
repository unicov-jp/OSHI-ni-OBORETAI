"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, inputClass, Notice } from "@/components/ui";
import { setPerOshiPrice } from "@/lib/actions/admin";

// 推し1人あたりの月額の入力と、人数ごとの月額の見え方
export function PriceEditor({ initial, freeOshi, maxOshi }: { initial: number | null; freeOshi: number; maxOshi: number }) {
  const router = useRouter();
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const per = value === "" ? null : Number(value);
  const samples = [freeOshi + 1, 10, 20, 30, maxOshi].filter((n, i, list) => n > freeOshi && n <= maxOshi && list.indexOf(n) === i);

  const save = () => {
    setMessage(null);
    if (per === null) return setMessage({ tone: "danger", text: "金額を入力してください" });
    startTransition(async () => {
      const result = await setPerOshiPrice(per);
      if (!result.ok) return setMessage({ tone: "danger", text: result.error });
      setMessage({ tone: "ok", text: "保存しました。料金ページに反映されます" });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-sm text-muted">推し1人あたり 月額</span>
        <input
          className={`${inputClass} w-32`}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
          aria-label="推し1人あたりの月額(円)"
          placeholder="100"
        />
        <span className="shrink-0 text-sm text-muted">円</span>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 text-sm">
        <p className="mb-2 text-xs text-muted">料金ページでの見え方(推し{freeOshi}人までは無料)</p>
        {per === null ? (
          <p className="text-muted">金額を入れると表示されます</p>
        ) : (
          <ul className="num space-y-1">
            {samples.map((n) => (
              <li key={n}>
                推し{n}人: 月額{((n - freeOshi) * per).toLocaleString("ja-JP")}円
              </li>
            ))}
          </ul>
        )}
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button variant="primary" onClick={save} disabled={pending}>
        {pending ? "保存中" : "保存する"}
      </Button>
    </div>
  );
}
