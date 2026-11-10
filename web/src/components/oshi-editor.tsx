"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { deleteOshiRecord, getOshiForEdit, saveOshiRecord } from "@/lib/actions/oshi";
import { importAllSns } from "@/lib/actions/sources";
import {
  emptySns, SNS_KEYS, SNS_LABEL, SNS_PLACEHOLDER, type GroupInput, type OshiEditable, type SnsInput,
} from "@/lib/oshi-record";
import { MEMBER_COLORS } from "@/lib/platforms";

// 推しの登録・編集。今のアプリ(推し活手帳)と同じ項目を、同じ記録に保存する。
// 写真・ギャラリーの変更は、今のところ今のアプリで行う(ここでは触らず、そのまま残す)。

const blank = (): OshiEditable => ({
  name: "",
  color: MEMBER_COLORS[1]?.value ?? "#EC6FA9",
  agency: "",
  birthMonth: "",
  birthDay: "",
  birthYear: "",
  person: emptySns(),
  groups: [],
});

export function OshiEditor({ oshiId, onDone }: { oshiId: string | null; onDone: (message: string, id?: string) => void }) {
  const [value, setValue] = useState<OshiEditable | null>(oshiId ? null : blank());
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!oshiId) return;
    let cancelled = false;
    void getOshiForEdit(oshiId).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data) setValue(result.data);
      else setError(result.ok ? "読み込めませんでした" : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [oshiId]);

  if (!value) {
    return error ? <Notice tone="danger">{error}</Notice> : <p className="text-sm text-muted">読み込み中</p>;
  }

  const set = (patch: Partial<OshiEditable>) => setValue({ ...value, ...patch });
  const setGroup = (index: number, patch: Partial<GroupInput>) =>
    set({ groups: value.groups.map((g, i) => (i === index ? { ...g, ...patch } : g)) });

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveOshiRecord(value);
      if (!result.ok) return setError(result.error);
      // 入力したSNSを、新着を取る先としても登録する(登録済みのものは重ねない)
      const imported = await importAllSns();
      const count = imported.ok && imported.data ? imported.data.added + imported.data.linked : 0;
      onDone(`保存しました。今のアプリにも反映されます${count > 0 ? `(SNSを${count}件登録しました)` : ""}`, result.data?.id);
    });
  };

  const remove = () => {
    if (!value.id) return;
    startTransition(async () => {
      const result = await deleteOshiRecord(value.id!);
      if (!result.ok) return setError(result.error);
      onDone("削除しました。今のアプリの「削除された記録を探す」から戻せます");
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Field label="名前">
          <input
            className={inputClass}
            value={value.name}
            maxLength={40}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="推しの名前"
          />
        </Field>

        <fieldset>
          <legend className="mb-1 text-[13px] font-medium">メンバーカラー</legend>
          <div className="flex flex-wrap items-center gap-2">
            {MEMBER_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={value.color.toLowerCase() === c.value.toLowerCase()}
                onClick={() => set({ color: c.value })}
                className={`h-9 w-9 shrink-0 rounded-full border-2 ${
                  value.color.toLowerCase() === c.value.toLowerCase() ? "border-text" : "border-line"
                }`}
                style={{ background: c.value }}
              />
            ))}
            <label className="flex h-9 items-center gap-2 rounded-lg border border-line px-2 text-[13px] text-muted">
              ほかの色
              <input
                type="color"
                value={value.color}
                onChange={(e) => set({ color: e.target.value })}
                className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="事務所">
            <input
              className={inputClass}
              value={value.agency}
              maxLength={40}
              onChange={(e) => set({ agency: e.target.value })}
              placeholder="未設定"
            />
          </Field>
          <fieldset>
            <legend className="mb-1 text-[13px] font-medium">誕生日</legend>
            <div className="flex gap-2">
              <select className={inputClass} value={value.birthMonth} onChange={(e) => set({ birthMonth: e.target.value })} aria-label="月">
                <option value="">月</option>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                  <option key={m} value={m}>{m}月</option>
                ))}
              </select>
              <select className={inputClass} value={value.birthDay} onChange={(e) => set({ birthDay: e.target.value })} aria-label="日">
                <option value="">日</option>
                {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                  <option key={d} value={d}>{d}日</option>
                ))}
              </select>
            </div>
          </fieldset>
        </div>
      </div>

      <SnsFields title="本人のSNS" value={value.person} onChange={(person) => set({ person })} />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-semibold">グループ(兼任は複数。先頭がメイン)</h3>
          <Button
            size="sm"
            disabled={value.groups.length >= 10}
            onClick={() => set({ groups: [...value.groups, { name: "", sns: emptySns() }] })}
          >
            グループを追加
          </Button>
        </div>
        {value.groups.length === 0 ? <p className="text-[13px] text-muted">グループはありません。</p> : null}
        {value.groups.map((group, index) => (
          <div key={group.id ?? `new-${index}`} className="space-y-3 rounded-xl border border-line p-4">
            <div className="flex items-end gap-2">
              <Field label={index === 0 ? "グループ名(メイン)" : "グループ名"}>
                <input
                  className={inputClass}
                  value={group.name}
                  maxLength={40}
                  onChange={(e) => setGroup(index, { name: e.target.value })}
                />
              </Field>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => set({ groups: value.groups.filter((_, i) => i !== index) })}
              >
                外す
              </Button>
            </div>
            <SnsFields title="グループのSNS" value={group.sns} onChange={(sns) => setGroup(index, { sns })} compact />
          </div>
        ))}
      </section>

      <p className="text-xs text-muted">写真・ギャラリーの変更は、今のアプリ(推し活手帳)で行えます。</p>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={save} disabled={pending || !value.name.trim()}>
          {pending ? "保存中" : value.id ? "変更を保存" : "登録する"}
        </Button>
        {value.id ? (
          confirmDelete ? (
            <>
              <Button variant="danger" onClick={remove} disabled={pending}>
                削除する
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                やめる
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              この推しを削除
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

function SnsFields({ title, value, onChange, compact = false }: {
  title: string; value: SnsInput; onChange: (next: SnsInput) => void; compact?: boolean;
}) {
  return (
    <section className="space-y-3">
      {compact ? <p className="text-[13px] font-medium text-muted">{title}</p> : <h3 className="text-[15px] font-semibold">{title}</h3>}
      <div className="grid gap-3 sm:grid-cols-2">
        {SNS_KEYS.map((key) => (
          <Field key={key} label={SNS_LABEL[key]}>
            <input
              className={inputClass}
              value={value[key]}
              maxLength={300}
              inputMode={key === "web" ? "url" : "text"}
              placeholder={SNS_PLACEHOLDER[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
          </Field>
        ))}
      </div>
    </section>
  );
}
