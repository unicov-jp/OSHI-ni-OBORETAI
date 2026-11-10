"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, inputClass, Notice } from "@/components/ui";
import { setPerOshiPrice } from "@/lib/actions/admin";

// 推し1人あたりの月額の入力(有料・Advanced)と、人数ごとの月額の見え方
export function PriceEditor({ initial, initialAdvanced, freeOshi, maxOshi, paidName, advancedName }: {
  initial: number | null; initialAdvanced: number; freeOshi: number; maxOshi: number; paidName: string; advancedName: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const [advanced, setAdvanced] = useState(String(initialAdvanced));
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const per = value === "" ? null : Number(value);
  const adv = advanced === "" ? null : Number(advanced);
  const samples = [freeOshi + 1, 10, 20, 30, maxOshi].filter((n, i, list) => n > freeOshi && n <= maxOshi && list.indexOf(n) === i);

  const save = () => {
    setMessage(null);
    if (per === null || adv === null) return setMessage({ tone: "danger", text: "金額を入力してください" });
    startTransition(async () => {
      const result = await setPerOshiPrice(per, adv);
      if (!result.ok) return setMessage({ tone: "danger", text: result.error });
      setMessage({ tone: "ok", text: "保存しました。料金ページに反映されます" });
      router.refresh();
    });
  };

  const row = (label: string, v: string, set: (s: string) => void) => (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 truncate text-sm font-semibold">{label}</span>
      <span className="shrink-0 text-sm text-muted">推し1人 月額</span>
      <input
        className={`${inputClass} w-28`}
        inputMode="numeric"
        value={v}
        onChange={(e) => set(e.target.value.replace(/\D/g, ""))}
        aria-label={`${label}の推し1人あたりの月額(円)`}
        placeholder="100"
      />
      <span className="shrink-0 text-sm text-muted">円</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {row(paidName, value, setValue)}
      {row(advancedName, advanced, setAdvanced)}

      <div className="rounded-xl border border-line bg-surface p-4 text-sm">
        <p className="mb-2 text-xs text-muted">料金ページでの見え方(推し{freeOshi}人までは無料)</p>
        <table className="num w-full text-left">
          <thead className="text-xs text-muted">
            <tr>
              <th className="font-normal">推しの人数</th>
              <th className="font-normal">{paidName}</th>
              <th className="font-normal">{advancedName}</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((n) => (
              <tr key={n}>
                <td>{n}人</td>
                <td>{per === null ? "—" : `月額${((n - freeOshi) * per).toLocaleString("ja-JP")}円`}</td>
                <td>{adv === null ? "—" : `月額${((n - freeOshi) * adv).toLocaleString("ja-JP")}円`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button variant="primary" onClick={save} disabled={pending}>
        {pending ? "保存中" : "保存する"}
      </Button>
    </div>
  );
}
