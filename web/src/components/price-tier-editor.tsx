"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, inputClass, Notice } from "@/components/ui";
import { setPriceTiers } from "@/lib/actions/admin";

type Row = { key: number; max: string; price: string };

// 料金の段階の入力: 「◯人まで」「月額◯円」を行ごとに入れる(10段階まで)
export function PriceTierEditor({ initial, freeOshi }: { initial: { max_oshi: number; monthly_yen: number }[]; freeOshi: number }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((t, i) => ({ key: i, max: String(t.max_oshi), price: String(t.monthly_yen) }))
      : [{ key: 0, max: "", price: "" }],
  );
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: number, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const sorted = [...rows]
    .filter((r) => r.max && r.price)
    .map((r) => ({ max_oshi: Number(r.max), monthly_yen: Number(r.price) }))
    .sort((a, b) => a.max_oshi - b.max_oshi);

  const save = () => {
    setMessage(null);
    if (rows.some((r) => (r.max === "") !== (r.price === ""))) {
      return setMessage({ tone: "danger", text: "人数と金額は両方入れてください" });
    }
    startTransition(async () => {
      const result = await setPriceTiers(sorted);
      if (!result.ok) return setMessage({ tone: "danger", text: result.error });
      setMessage({ tone: "ok", text: "保存しました。料金ページに反映されます" });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <input
              className={`${inputClass} w-24`}
              inputMode="numeric"
              value={row.max}
              onChange={(e) => update(row.key, { max: e.target.value.replace(/\D/g, "") })}
              aria-label="推しの人数(まで)"
              placeholder="10"
            />
            <span className="shrink-0 text-sm text-muted">人まで 月額</span>
            <input
              className={`${inputClass} w-28`}
              inputMode="numeric"
              value={row.price}
              onChange={(e) => update(row.key, { price: e.target.value.replace(/\D/g, "") })}
              aria-label="月額(円)"
              placeholder="300"
            />
            <span className="shrink-0 text-sm text-muted">円</span>
            <Button size="sm" variant="ghost" onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))} aria-label="この段階を消す">
              消す
            </Button>
          </div>
        ))}
      </div>
      <Button
        size="sm"
        disabled={rows.length >= 10}
        onClick={() => setRows((list) => [...list, { key: Math.max(-1, ...list.map((r) => r.key)) + 1, max: "", price: "" }])}
      >
        段階を追加
      </Button>

      {/* 料金ページでの見え方 */}
      <div className="rounded-xl border border-line bg-surface p-4 text-sm">
        <p className="mb-2 text-xs text-muted">料金ページでの見え方</p>
        <ul className="num space-y-1">
          <li>推し{freeOshi}人まで: 無料</li>
          {sorted.map((t, i) => (
            <li key={t.max_oshi}>
              推し{(i === 0 ? freeOshi : sorted[i - 1].max_oshi) + 1}〜{t.max_oshi}人: 月額{t.monthly_yen.toLocaleString("ja-JP")}円
            </li>
          ))}
        </ul>
      </div>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Button variant="primary" onClick={save} disabled={pending}>
        {pending ? "保存中" : "保存する"}
      </Button>
    </div>
  );
}
