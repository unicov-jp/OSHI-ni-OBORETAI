"use client";

import { useState, useTransition } from "react";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { copyOshiBetweenUsers } from "@/lib/actions/copy-oshi";

type Result = { name: string; status: "copied" | "skipped" | "not_found"; note?: string };
const LABEL: Record<Result["status"], string> = { copied: "複製しました", skipped: "複製しませんでした", not_found: "見つかりません" };

export function CopyOshiForm() {
  const [fromEmail, setFromEmail] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [names, setNames] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () => {
    setError(null);
    setResults(null);
    const list = names.split(/[\n、,]+/).map((n) => n.trim()).filter(Boolean);
    startTransition(async () => {
      const result = await copyOshiBetweenUsers({ fromEmail, toEmail, names: list });
      if (!result.ok) return setError(result.error);
      setResults(result.data?.results ?? []);
    });
  };

  return (
    <div className="space-y-4">
      <Field label="コピー元のメールアドレス">
        <input className={inputClass} type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="コピー先のメールアドレス">
        <input className={inputClass} type="email" value={toEmail} onChange={(e) => setToEmail(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="推しの名前" hint="1行に1人(または「、」区切り)。名前の一部でも探します">
        <textarea
          className={`${inputClass} h-28 py-2`}
          value={names}
          onChange={(e) => setNames(e.target.value)}
          placeholder={"推しの名前\n推しの名前"}
        />
      </Field>
      <Button variant="primary" disabled={pending || !fromEmail || !toEmail || !names.trim()} onClick={run}>
        {pending ? "複製しています…" : "複製する"}
      </Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {results ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
          {results.map((r) => (
            <li key={r.name} className="px-4 py-3">
              <p className="font-semibold">
                {r.name}・<span className={r.status === "copied" ? "text-ok" : "text-warn"}>{LABEL[r.status]}</span>
              </p>
              {r.note ? <p className="mt-1 text-xs text-muted">{r.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
